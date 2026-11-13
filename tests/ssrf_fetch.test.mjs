import test from "node:test";
import assert from "node:assert/strict";
import { fetchTextWithCap } from "../functions/_lib/chain.js";

test("blocks private and metadata IPs and non-http schemes - no network call made", async () => {
  const bads = [
    "ftp://example.com/",
    "http://localhost/",
    "http://127.0.0.1/",
    "http://169.254.169.254/",
    "http://[::1]/",
    "http://192.168.0.1/",
    "http://10.0.0.1/",
    "http://172.16.0.1/"
  ];
  const prev = global.fetch;
  let calls = 0;
  global.fetch = async function(_url, _opts) { calls++; return { ok:false, status:599, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) }; };
  for (const u of bads) {
    const r = await fetchTextWithCap(u, 1024);
    assert.ok(r.error, `expected error for ${u}`);
  }
  assert.equal(calls, 0, "fetch must not be called for blocked URLs");
  global.fetch = prev;
});

test("blocks localhost variants, multicast, benchmark, mapped IPv6 (dotted and hex), and trailing-dot hosts - no network call made", async () => {
  const bads = [
    "http://localhost./",
    "http://sub.localhost/",
    "http://0.0.0.0/",
    "http://224.0.0.1/",
    "http://198.18.0.1/",
    "http://[::]/",
    "http://[ff00::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://[::ffff:7f00:1]/",
    "http://[::ffff:a9fe:a9fe]/"
  ];
  const prev = global.fetch;
  let calls = 0;
  global.fetch = async function(_url, _opts) { calls++; return { ok:false, status:599, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) }; };
  for (const u of bads) {
    const r = await fetchTextWithCap(u, 1024);
    assert.ok(r.error, `expected error for ${u}`);
  }
  assert.equal(calls, 0, "fetch must not be called for blocked URLs");
  global.fetch = prev;
});

test("redirects re-checked and limited", async () => {
  const prev = global.fetch;
  let callCount = 0;
  global.fetch = async function(url, opts) {
    callCount++;
    if (callCount === 1) {
      return { status: 302, headers: new Map([["location","http://127.0.0.1/"]]), body: null, ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    throw new Error("should_not_follow");
  };
  const r = await fetchTextWithCap("https://example.com", 1024);
  assert.ok(r.error, "expected error after redirect to blocked host");
  global.fetch = prev;
});

test("redirect manual mode and hop limit 3", async () => {
  const prev = global.fetch;
  let hops = 0;
  let seenRedirectManual = false;
  global.fetch = async function(url, opts) {
    if (opts && opts.redirect === "manual") seenRedirectManual = true;
    if (hops < 4) {
      hops++;
      return { status: 302, headers: new Map([["location","https://next.example/"+hops]]), ok: false, body: null, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    return { status: 200, headers: new Map([["content-type","text/plain"]]), ok: true, arrayBuffer: async () => Buffer.from("ok") };
  };
  const r = await fetchTextWithCap("https://start.example", 1024);
  assert.equal(seenRedirectManual, true);
  assert.equal(r.error, "too_many_redirects");
  global.fetch = prev;
});

