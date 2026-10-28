/**
 * Fetch a caller-supplied URL without opening an SSRF hole.
 *
 * - https only, default port, no embedded credentials;
 * - every hop's host must resolve only to public addresses (IP literals
 *   are checked the same way), so `https://10.0.0.5/` or a hostname that
 *   points inside the network is refused before any request is made;
 * - redirects are followed by hand (max 3) and each target is re-checked,
 *   so an https URL cannot bounce to `http://169.254.169.254/…`;
 * - the body is capped while it streams, not after it is buffered.
 *
 * The check-then-connect gap (DNS rebinding) is not pinned here. https-only
 * is what blunts it: an internal service cannot present a valid
 * certificate for the attacker's hostname, so the TLS handshake fails.
 */

import dns from "node:dns";
import { BlockList, isIP } from "node:net";

export type PublicFetchErrorKind = "invalid" | "insecure" | "blocked" | "failed" | "too_large";

export class PublicFetchError extends Error {
  constructor(
    public kind: PublicFetchErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export type Resolve = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

// One list per family: a single BlockList matches IPv4 addresses against
// IPv6 rules via their mapped form, so ::ffff:0:0/96 would block all IPv4.
const NON_PUBLIC_V4 = new BlockList();
const NON_PUBLIC_V6 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  NON_PUBLIC_V4.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  NON_PUBLIC_V6.addSubnet(net, prefix, "ipv6");
}

/** True only for globally routable unicast addresses. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !NON_PUBLIC_V4.check(address, "ipv4");
  if (family === 6) return !NON_PUBLIC_V6.check(address, "ipv6");
  return false;
}

const defaultResolve: Resolve = (hostname) =>
  dns.promises.lookup(hostname, { all: true, verbatim: true });

async function assertPublicHttps(url: URL, resolve: Resolve): Promise<void> {
  if (url.protocol !== "https:") throw new PublicFetchError("insecure", "URL must be https");
  if (url.username !== "" || url.password !== "") {
    throw new PublicFetchError("blocked", "URL must not carry credentials");
  }
  if (url.port !== "" && url.port !== "443") {
    throw new PublicFetchError("blocked", "URL must use the default https port");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: Array<{ address: string }>;
  try {
    addresses = isIP(host) !== 0 ? [{ address: host }] : await resolve(host);
  } catch {
    throw new PublicFetchError("failed", "URL host did not resolve");
  }
  if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
    throw new PublicFetchError("blocked", "URL host resolves to a non-public address");
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const tooLarge = () => new PublicFetchError("too_large", `download exceeds ${maxBytes} bytes`);
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    throw tooLarge();
  }
  if (res.body === null) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function fetchPublicHttps(
  rawUrl: string,
  opts: {
    maxBytes: number;
    timeoutMs: number;
    maxRedirects?: number;
    resolve?: Resolve;
    fetchImpl?: typeof fetch;
  },
): Promise<Uint8Array> {
  const resolve = opts.resolve ?? defaultResolve;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxRedirects = opts.maxRedirects ?? 3;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PublicFetchError("invalid", "URL is not valid");
  }
  const signal = AbortSignal.timeout(opts.timeoutMs);
  for (let hop = 0; ; hop++) {
    await assertPublicHttps(url, resolve);
    let res: Response;
    try {
      res = await fetchImpl(url, { redirect: "manual", signal });
    } catch {
      throw new PublicFetchError("failed", "download failed (network error)");
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (location === null)
        throw new PublicFetchError("failed", `download failed: HTTP ${res.status}`);
      if (hop >= maxRedirects) throw new PublicFetchError("failed", "too many redirects");
      try {
        url = new URL(location, url);
      } catch {
        throw new PublicFetchError("invalid", "redirect target is not a valid URL");
      }
      continue;
    }
    if (!res.ok) throw new PublicFetchError("failed", `download failed: HTTP ${res.status}`);
    return readCapped(res, opts.maxBytes);
  }
}
