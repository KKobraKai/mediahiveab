import test from "node:test";
import assert from "node:assert/strict";
import { fetchTextWithCap } from "../functions/_lib/chain.js";

test("streaming stops reading further chunks once cap is reached", async () => {
  const cap = 1000;
  const chunk1 = new Uint8Array(700).fill(97);
  const chunk2 = new Uint8Array(700).fill(98); // will push us over cap
  const chunk3 = new Uint8Array(700).fill(99); // should NOT be read
  let readCount = 0;
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
              readCount++;
              if (idx === 1) return { done: false, value: chunk1 };
              if (idx === 2) return { done: false, value: chunk2 };
              if (idx === 3) return { done: false, value: chunk3 };
              return { done: true, value: undefined };
            }
          };
        }
      }
    };
  };
  try {
    const res = await fetchTextWithCap("https://example.com", cap);
    assert.ok(res.bytes <= cap, "bytes must not exceed cap");
    assert.equal(readCount, 2, "reader should stop after crossing cap");
  } finally {
    global.fetch = prev;
  }
});

