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

test("streaming reader size cap at 1MB", async () => {
  const chunk1 = new Uint8Array(800_000).fill(97);
  const chunk2 = new Uint8Array(400_000).fill(98);
  const prev = global.fetch;
  global.fetch = async function(_url, _opts) {
    return {
      headers: new Map([["content-type","text/plain"]]),
      ok: true,
      status: 200,
      body: {
        getReader() {
          let idx = 0;
          return {
            async read() {
              idx++;
              if (idx === 1) return { done: false, value: chunk1 };
              if (idx === 2) return { done: false, value: chunk2 };
              return { done: true, value: undefined };
            }
          };
        }
      }
    };
  };
  const res = await fetchTextWithCap("https://example.com", 1_000_000);
  assert.ok(res.bytes <= 1_000_000);
  global.fetch = prev;
});

