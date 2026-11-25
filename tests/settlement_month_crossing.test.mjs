import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/synergimotor.js";

// Simulates crossing midnight UTC between reservation and settlement.
// Verifies settlement debits the original reservation month key.

function makeDoBinding(capture) {
  const store = new Map();
  return {
    idFromName(name) { return { name }; },
    get(id) {
      return {
        async fetch(req) {
          const url = new URL(req.url);
          const op = url.pathname.split("/").pop();
          const body = await req.json();
          const key = body.key;
          const get = () => Number(store.get(key) || 0);
          const put = (v) => { store.set(key, String(v)); };
          if (op === "reserve") {
            const cur = get();
            const after = cur + Number(body.amount || 0);
            const refuseAt = Number(body.refuseAt || 0);
            if (after > refuseAt) return new Response(JSON.stringify({ ok: false, current: cur }), { headers: { "content-type":"application/json" } });
            put(after);
            capture.lastReserveKey = key;
            return new Response(JSON.stringify({ ok: true, current: after }), { headers: { "content-type":"application/json" } });
          }
          if (op === "adjust") {
            const cur = get();
            const next = Math.max(0, cur + Number(body.delta || 0));
            put(next);
            capture.lastAdjustKey = key;
            return new Response(JSON.stringify({ ok: true, current: next }), { headers: { "content-type":"application/json" } });
          }
          if (op === "get") {
            const cur = get();
            return new Response(JSON.stringify({ ok: true, current: cur }), { headers: { "content-type":"application/json" } });
          }
          return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { "content-type":"application/json" } });
        }
      };
    }
  };
}

function makeEnv(capture, overrides = {}) {
  const m = new Map();
  return {
    SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
    SYNERGI_PROVIDER: "mock",
    SYNERGI_MODEL: "mock-mini",
    SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 0, outputPer1k: 0 } }),
    SYNERGI_SPEND_CAP_SEK: "100",
    SYNERGI_SPEND_REFUSE_AT_SEK: "100",
    SYNERGI_MAX_INPUT_TOKENS: "100",
    SYNERGI_MAX_OUTPUT_TOKENS: "100",
    SYNERGI_COUNTER: makeDoBinding(capture),
    ...overrides
  };
}

function req(body, headers = {}) {
  const h = new Map(Object.entries(headers));
  return {
    json: async () => body,
    headers: { get: (k) => h.get(k) },
    method: "POST",
    url: "https://mediahiveab.com/api/synergimotor"
  };
}

test("settlement uses the reservation's month key across UTC month boundary", async () => {
  const capture = {};
  const env = makeEnv(capture);
  const realDate = global.Date;
  // Two consecutive Date.now()/new Date() reads inside the handler: one before reserve, one before adjust.
  // Provide end-of-month then beginning-of-next-month.
  const times = [
    Date.UTC(2026, 0, 31, 23, 59, 59), // 2026-01-31T23:59:59Z (for reservation)
    Date.UTC(2026, 1, 1, 0, 0, 5)      // 2026-02-01T00:00:05Z (for settlement)
  ];
  function nextTime() { return times.length ? times.shift() : Date.UTC(2026, 1, 1, 0, 0, 10); }
  class FakeDate extends Date {
    constructor(...args) {
      if (args.length) { super(...args); return; }
      super(nextTime());
    }
    static now() { return nextTime(); }
  }
  global.Date = FakeDate;
  try {
    const r = await onRequestPost({ request: req({ a: { name:"A" }, bList: [{ name:"B"}] }, { origin: "https://mediahiveab.com", "cf-connecting-ip": "3.3.3.3" }), env });
    await r.json(); // ignore body; focus on keys used
    // Old behavior: adjust key used current month (second timestamp); New behavior: must use reservation month (first timestamp).
    // Reserve key must equal adjust key after the fix.
    assert.equal(capture.lastReserveKey, capture.lastAdjustKey, "settlement must debit the same month key as reservation");
  } finally {
    global.Date = realDate;
  }
});

