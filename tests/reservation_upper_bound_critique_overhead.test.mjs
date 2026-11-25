import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/synergimotor.js";

function makeEnv(overrides = {}) {
  const m = new Map();
  function makeDoBinding() {
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
              return new Response(JSON.stringify({ ok: true, current: after }), { headers: { "content-type":"application/json" } });
            }
            if (op === "adjust") {
              const cur = get();
              const next = Math.max(0, cur + Number(body.delta || 0));
              put(next);
              return new Response(JSON.stringify({ ok: true, current: next }), { headers: { "content-type":"application/json" } });
            }
            if (op === "inc") {
              const cur = get();
              const limit = Number(body.limit || Infinity);
              const next = cur + Number(body.delta || 1);
              if (next > limit) return new Response(JSON.stringify({ ok: false, count: cur }), { headers: { "content-type":"application/json" } });
              put(next);
              return new Response(JSON.stringify({ ok: true, count: next }), { headers: { "content-type":"application/json" } });
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
  return {
    SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
    SYNERGI_PROVIDER: "mock",
    SYNERGI_MODEL: "mock-mini",
    // Price 1/1 to make thresholds obvious
    SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 1, outputPer1k: 1 } }),
    // Choose limits so 2*(in=150 + out=100) == 0.5 SEK exactly without overhead -> old code would allow
    // With overhead included per call, the reservation must exceed 0.5 and be refused.
    SYNERGI_MAX_INPUT_TOKENS: "150",
    SYNERGI_MAX_OUTPUT_TOKENS: "100",
    SYNERGI_SPEND_CAP_SEK: "1",
    SYNERGI_SPEND_REFUSE_AT_SEK: "1",
    SYNERGI_COUNTER: makeDoBinding(),
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

test("reservation worst-case includes critique input + overhead and refuses > 0.50", async () => {
  const env = makeEnv();
  const r = await onRequestPost({ request: req({ a: { name: "A" }, bList: [{ name:"B"}] }, { origin: "https://mediahiveab.com", "cf-connecting-ip":"2.2.2.2" }), env });
  // After fix: should be refused as > 0.5 SEK with overhead included.
  assert.equal(r.status, 402, "worst-case must exceed 0.50 SEK and be refused");
  const j = await r.json();
  assert.equal(j.error, "budget_worst_case_exceeds");
});

