import test from "node:test";
import assert from "node:assert/strict";
import { fetchTextWithCap } from "../functions/_lib/chain.js";

test("website fetch size cap", async () => {
  const big = "x".repeat(200_000);
  const prev = global.fetch;
  global.fetch = async function(_url, _opts) {
    return {
      headers: new Map([["content-type","text/html"]]),
      arrayBuffer: async () => Buffer.from(big, "utf8"),
      ok: true,
      status: 200
    };
  };
  global.fetch.headers = { get(){ return "text/html"; } };
  const res = await fetchTextWithCap("https://example.com", 100_000);
  assert.ok(res.bytes <= 100_000);
  global.fetch = prev;
});

