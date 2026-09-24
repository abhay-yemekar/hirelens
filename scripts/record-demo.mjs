/**
 * Launch asset generator: drives the real /demo page in headless Chrome
 * and captures staged screenshots via CDP for the README demo GIF.
 *
 * Why captureScreenshot per beat instead of Page.startScreencast: the
 * screencast only emits frames when the page paints, so playback speed
 * depends on Chrome's render loop (a static page yields a slideshow).
 * Staged beats with explicit holds give a deterministic, evenly-paced
 * timeline that the GIF assembler can encode 1:1.
 *
 * Usage: node scripts/record-demo.mjs [--url <demoUrl>] [--out <dir>]
 * Default: local dev server, shots into .tmp-demo-frames/.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) {
  console.error("No Chrome/Edge found for CDP recording.");
  process.exit(1);
}

const OUT_DIR = ".tmp-demo-frames";
const args = process.argv.slice(2);
const urlIdx = args.indexOf("--url");
const DEMO_URL = urlIdx >= 0 ? args[urlIdx + 1] : "http://localhost:3001/demo";
const WIDTH = 1440;
const HEIGHT = 860;

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

// ── Launch Chrome with a fresh profile and a CDP port ────────────────
// On Windows, spawn() mangles /-prefixed flags through MSYS bash; going
// through powershell Start-Process keeps every argument verbatim.
const chromeArgs = [
  "--headless=new",
  "--remote-debugging-port=9223",
  `--user-data-dir=${process.cwd()}\\.tmp-chrome-prof`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  `--window-size=${WIDTH},${HEIGHT}`,
  "about:blank",
];
// -PassThru prints the new process's PID so we can kill exactly that
// instance at the end — never the user's running browser. The PID goes
// through a FILE, not the stdout pipe: chrome.exe inherits the launcher's
// pipe handles, which would keep the stream open forever.
const PID_FILE = join(process.cwd(), ".tmp-chrome-pid.txt");
const psCmd = `(Start-Process -FilePath '${chromePath}' -ArgumentList ${chromeArgs
  .map((a) => `'${a}'`)
  .join(",")} -WindowStyle Hidden -PassThru).Id | Out-File -Encoding ascii '${PID_FILE}'`;
spawn("powershell.exe", ["-NoProfile", "-Command", psCmd], { stdio: "ignore" });
let chromePid = "";
for (let i = 0; i < 30 && !chromePid; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    chromePid = (await readFile(PID_FILE, "utf8")).trim();
  } catch {
    // not written yet
  }
}
const killChrome = () => {
  if (chromePid)
    spawn("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Stop-Process -Id ${chromePid} -Force -ErrorAction SilentlyContinue`,
    ]);
};

// Poll the CDP endpoint — first launch on a fresh profile can take a while.
let targets = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    targets = await fetch("http://127.0.0.1:9223/json").then((r) => r.json());
    if (Array.isArray(targets)) break;
  } catch {
    // not up yet
  }
}
if (!Array.isArray(targets)) {
  console.error("Chrome CDP never came up on :9223");
  killChrome();
  process.exit(1);
}
log("chrome launcher done");
const page = targets.find((t) => t.type === "page");
log("cdp up, opening debugger socket…");

let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pending.set(id, { resolve });
    try {
      ws.send(JSON.stringify({ id, method, params }));
    } catch (err) {
      pending.delete(id);
      reject(err);
      return;
    }
    // Fail fast instead of hanging forever if the socket dies.
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }
    }, 20_000);
  });
}

// Handlers attach BEFORE the socket can open — a response arriving before
// onmessage exists would hang the very first enable forever (seen live).
let ws = null;

function attachHandlers(socket) {
  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result ?? msg.error);
    }
  };
}

// A brand-new headless target sometimes silently drops the first CDP
// commands (socket opens, then nothing). Retry the connect+enable dance:
// close, refetch targets, reconnect. Two retries have always been enough.
for (let attempt = 1; attempt <= 3; attempt++) {
  ws = new WebSocket(page.webSocketDebuggerUrl);
  attachHandlers(ws);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("ws open timeout")), 15_000);
    ws.onopen = () => {
      clearTimeout(timeout);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("ws open failed"));
    };
  });
  try {
    await Promise.race([
      Promise.all([send("Page.enable"), send("Runtime.enable")]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("enable timeout")), 8_000)),
    ]);
    break;
  } catch (err) {
    log(`attempt ${attempt}: ${err.message} — reconnecting`);
    try {
      ws.close();
    } catch {}
    if (attempt === 3) throw err;
    pending.clear();
    await new Promise((r) => setTimeout(r, 1500));
    const fresh = await fetch("http://127.0.0.1:9223/json").then((r) => r.json());
    Object.assign(page, fresh.find((t) => t.type === "page") ?? page);
  }
}
log("debugger socket open");

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return res?.result?.value;
}

// ── Navigate and set viewport via emulation ──────────────────────────
await send("Emulation.setDeviceMetricsOverride", {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 2, // crisp text in the GIF
  mobile: false,
});
await send("Page.navigate", { url: DEMO_URL });
log(`navigating → ${DEMO_URL}`);
await new Promise((r) => setTimeout(r, 5000));

// ── Staged capture ───────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = []; // { file, delayMs } — delay is time until the NEXT shot

async function shot(holdMs = 500) {
  const res = await send("Page.captureScreenshot", { format: "png" });
  const file = `shot-${String(shots.length).padStart(3, "0")}.png`;
  await writeFile(join(OUT_DIR, file), Buffer.from(res.data, "base64"));
  shots.push({ file, delayMs: holdMs });
  await sleep(holdMs);
}

const clickButton = (match) =>
  evaluate(`(() => {
    const b = [...document.querySelectorAll("button")].find(x => x.textContent.trim().includes(${JSON.stringify(match)}));
    if (b) b.click();
    return !!b;
  })()`);

try {
  // Beat 1 — landing view: hero, JD card, six resume cards.
  log("beat 1: landing");
  await shot(1200);
  await shot(900);

  // Beat 2 — pick a candidate (border highlights, score button enables).
  log("beat 2: select candidate");
  if (!(await clickButton("Jordan Avery"))) log("WARN: Jordan Avery button not found");
  await sleep(500);
  await shot(900);
  await shot(800);

  // Beat 3 — press score. On production this is a real LLM call (several
  // seconds); on dev it's the instant heuristic. Either way: capture the
  // pressed state, then poll for the scorecard, taking a shot mid-wait so
  // the anticipation reads in the GIF.
  log("beat 3: score");
  await clickButton("Score");
  await sleep(300);
  await shot(800); // "Scoring…" state
  let scored = false;
  let midShot = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    scored = await evaluate(`document.body.innerText.includes("/5")`);
    if (scored) break;
    if (!midShot && Date.now() - t0 > 2500) {
      await shot(900); // still scoring — show the wait (reads as anticipation)
      midShot = true;
    }
    await sleep(700);
  }
  if (!scored) log("WARN: scorecard never appeared within 60s");
  await sleep(300);
  await shot(800); // scorecard arriving

  // Beat 4 — the full scorecard: overall score + five criteria rows.
  log("beat 4: scorecard hold");
  for (let i = 0; i < 4; i++) await shot(800);

  // Beat 5 — open a criterion: the row highlights and the resume shows
  // the quoted evidence highlighted. This is the product's whole pitch.
  log("beat 5: open evidence");
  const opened = await evaluate(`(() => {
    const rows = [...document.querySelectorAll("button")].filter(b => b.textContent.includes("/5"));
    const row = rows[1] ?? rows[0];
    if (row) row.click();
    return !!row;
  })()`);
  if (!opened) log("WARN: criterion row not found");
  await sleep(500);
  for (let i = 0; i < 3; i++) await shot(900);

  // Beat 6 — scroll the highlighted quote into view, then back to top.
  log("beat 6: quote in context");
  await evaluate(`(() => {
    const marks = document.querySelectorAll("mark");
    (marks[0] ?? null)?.scrollIntoView({ block: "center" });
    return marks.length;
  })()`);
  await sleep(500);
  for (let i = 0; i < 2; i++) await shot(900);

  await evaluate(`window.scrollTo({ top: 0 })`);
  await sleep(400);
  await shot(1200);

  log(`captured ${shots.length} shots`);
} finally {
  await writeFile(
    join(OUT_DIR, "frames.json"),
    JSON.stringify({ url: DEMO_URL, width: WIDTH, height: HEIGHT, shots }, null, 2),
  );
  try {
    ws.close();
  } catch {}
  killChrome();
}

log("done — run scripts/frames-to-gif.mjs next");
