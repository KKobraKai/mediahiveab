import test from "node:test";
import assert from "node:assert/strict";
import { fetchTextWithCap } from "../functions/_lib/chain.js";

test("blocks CGNAT 100.64/10 and IPv6 ULA fc00::/7", async () => {
  const prev = global.fetch;
  let calls = 0;
  global.fetch = async function(_url, _opts) { calls++; return { ok:false, status:599, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) }; };
  const bads = ["http://100.64.0.1/", "http://[fc00::1]/"];
  for (const u of bads) {
    const r = await fetchTextWithCap(u, 1024);
    assert.ok(r.error, `expected error for ${u}`);
  }
  assert.equal(calls, 0);
  global.fetch = prev;
});

test("blocks IPv4-compatible ::7f00:1 and NAT64 64:ff9b::/96 mapped forms", async () => {
  const prev = global.fetch;
  let calls = 0;
  global.fetch = async function(_url, _opts) { calls++; return { ok:false, status:599, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) }; };
  const bads = ["http://[::7f00:1]/", "http://[64:ff9b::192.168.0.1]/", "http://[64:ff9b::a9fe:a9fe]/"];
  for (const u of bads) {
    const r = await fetchTextWithCap(u, 1024);
    assert.ok(r.error, `expected error for ${u}`);
  }
  assert.equal(calls, 0);
  global.fetch = prev;
});

