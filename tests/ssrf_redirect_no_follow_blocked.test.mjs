import test from "node:test";
import assert from "node:assert/strict";
import { fetchTextWithCap } from "../functions/_lib/chain.js";

test("redirect re-check: do not follow to 127.0.0.1, even if target would be 200", async () => {
  const prev = global.fetch;
  let calls = [];
  global.fetch = async function(url, opts) {
    const u = String(url);
    calls.push(u);
    if (u === "https://start.example/") {
      return { status: 302, headers: new Map([["location","http://127.0.0.1/ok"]]), ok: false, body: null, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    if (u.startsWith("http://127.0.0.1/")) {
      // If code incorrectly follows, simulate success
      return { status: 200, headers: new Map([["content-type","text/plain"]]), ok: true, arrayBuffer: async () => Buffer.from("oops") };
    }
    throw new Error("unexpected fetch " + u);
  };
  try {
    const r = await fetchTextWithCap("https://start.example/", 1024);
    assert.ok(r.error, "expected an error after redirecting to blocked host");
    assert.ok(!calls.some(u => u.startsWith("http://127.0.0.1/")), "must not fetch 127.0.0.1");
  } finally {
    global.fetch = prev;
  }
});

