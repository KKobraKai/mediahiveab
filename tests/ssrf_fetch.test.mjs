import test from "node:test";
import assert from "node:assert/strict";
import { fetchTextWithCap } from "../functions/_lib/chain.js";

test("blocks private and metadata IPs and non-http schemes", async () => {
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
  global.fetch = async function(_url, _opts) { throw new Error("should_not_fetch"); };
  for (const u of bads) {
    const r = await fetchTextWithCap(u, 1024);
    assert.ok(r.error, `expected error for ${u}`);
  }
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

