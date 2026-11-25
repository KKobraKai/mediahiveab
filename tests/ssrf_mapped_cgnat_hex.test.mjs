import test from "node:test";
import assert from "node:assert/strict";
import { fetchTextWithCap } from "../functions/_lib/chain.js";

test("blocks IPv4-mapped CGNAT hex form ::ffff:6440:x", async () => {
  const prev = global.fetch;
  let calls = 0;
  global.fetch = async function(_url, _opts) { calls++; return { ok:false, status:599, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) }; };
  try {
    const r = await fetchTextWithCap("http://[::ffff:6440:0001]/", 1024);
    assert.ok(r.error, "expected error");
    assert.equal(calls, 0, "must not make a network call");
  } finally {
    global.fetch = prev;
  }
});

