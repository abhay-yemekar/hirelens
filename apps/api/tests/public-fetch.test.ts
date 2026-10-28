/**
 * SSRF guard for caller-supplied URLs (ATS webhook resume downloads).
 * Pure unit tests: DNS and fetch are injected, nothing touches the network.
 */

import { describe, expect, it } from "vitest";
import {
  fetchPublicHttps,
  isPublicAddress,
  PublicFetchError,
  type Resolve,
} from "../src/public-fetch.js";

const PUBLIC_V4 = "93.184.215.14";

const resolveTo =
  (...addresses: string[]): Resolve =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

const okBody = (body: string, headers: Record<string, string> = {}) =>
  (async () => new Response(body, { headers })) as typeof fetch;

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "resolved";
  } catch (err) {
    return err instanceof PublicFetchError ? err.kind : `other: ${String(err)}`;
  }
}

const opts = { maxBytes: 64, timeoutMs: 5_000 };

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "64:ff9b::a00:1",
    "not-an-ip",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([PUBLIC_V4, "8.8.8.8", "2606:4700:4700::1111"])("allows %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe("fetchPublicHttps", () => {
  it("returns the body for a public https URL", async () => {
    const bytes = await fetchPublicHttps("https://ats.example.com/cv.txt", {
      ...opts,
      resolve: resolveTo(PUBLIC_V4),
      fetchImpl: okBody("JANE DOE"),
    });
    expect(new TextDecoder().decode(bytes)).toBe("JANE DOE");
  });

  it.each([
    ["http://ats.example.com/cv.txt", "insecure"],
    ["https://user:pass@ats.example.com/cv.txt", "blocked"],
    ["https://ats.example.com:8443/cv.txt", "blocked"],
    ["https://127.0.0.1/cv.txt", "blocked"],
    ["https://[::1]/cv.txt", "blocked"],
    ["https://169.254.169.254/latest/meta-data/", "blocked"],
    ["https://0x7f000001/cv.txt", "blocked"],
    ["not a url", "invalid"],
  ])("refuses %s (%s)", async (url, kind) => {
    const result = await kindOf(
      fetchPublicHttps(url, { ...opts, resolve: resolveTo(PUBLIC_V4), fetchImpl: okBody("x") }),
    );
    expect(result).toBe(kind);
  });

  it("refuses a hostname that resolves to a private address", async () => {
    const result = await kindOf(
      fetchPublicHttps("https://intranet.example.com/cv.txt", {
        ...opts,
        resolve: resolveTo(PUBLIC_V4, "10.0.0.5"),
        fetchImpl: okBody("x"),
      }),
    );
    expect(result).toBe("blocked");
  });

  it("never fetches when the first hop is refused", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("x");
    }) as typeof fetch;
    await kindOf(
      fetchPublicHttps("https://metadata.example.com/", {
        ...opts,
        resolve: resolveTo("169.254.169.254"),
        fetchImpl,
      }),
    );
    expect(calls).toBe(0);
  });

  it("re-checks every redirect: https may not bounce to http or to a private host", async () => {
    const redirectTo = (location: string) =>
      (async () => new Response(null, { status: 302, headers: { location } })) as typeof fetch;

    expect(
      await kindOf(
        fetchPublicHttps("https://ats.example.com/cv.txt", {
          ...opts,
          resolve: resolveTo(PUBLIC_V4),
          fetchImpl: redirectTo("http://169.254.169.254/latest/meta-data/"),
        }),
      ),
    ).toBe("insecure");

    expect(
      await kindOf(
        fetchPublicHttps("https://ats.example.com/cv.txt", {
          ...opts,
          resolve: async (host) =>
            host === "internal.example.com"
              ? [{ address: "192.168.0.10", family: 4 }]
              : [{ address: PUBLIC_V4, family: 4 }],
          fetchImpl: redirectTo("https://internal.example.com/secret"),
        }),
      ),
    ).toBe("blocked");
  });

  it("follows a public redirect, but at most three hops", async () => {
    let hops = 0;
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      hops += 1;
      const url = String(input);
      return url.endsWith("/final")
        ? new Response("JANE DOE")
        : new Response(null, { status: 302, headers: { location: "/final" } });
    }) as typeof fetch;
    const bytes = await fetchPublicHttps("https://ats.example.com/start", {
      ...opts,
      resolve: resolveTo(PUBLIC_V4),
      fetchImpl,
    });
    expect(new TextDecoder().decode(bytes)).toBe("JANE DOE");
    expect(hops).toBe(2);

    const loop = (async () =>
      new Response(null, { status: 302, headers: { location: "/again" } })) as typeof fetch;
    expect(
      await kindOf(
        fetchPublicHttps("https://ats.example.com/start", {
          ...opts,
          resolve: resolveTo(PUBLIC_V4),
          fetchImpl: loop,
        }),
      ),
    ).toBe("failed");
  });

  it("caps the body by declared length and while streaming", async () => {
    expect(
      await kindOf(
        fetchPublicHttps("https://ats.example.com/cv.txt", {
          ...opts,
          resolve: resolveTo(PUBLIC_V4),
          fetchImpl: okBody("x".repeat(10), { "content-length": "1000" }),
        }),
      ),
    ).toBe("too_large");

    expect(
      await kindOf(
        fetchPublicHttps("https://ats.example.com/cv.txt", {
          ...opts,
          resolve: resolveTo(PUBLIC_V4),
          fetchImpl: okBody("x".repeat(65)),
        }),
      ),
    ).toBe("too_large");
  });
});
