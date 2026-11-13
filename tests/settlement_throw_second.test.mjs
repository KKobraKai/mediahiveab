import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/synergimotor.js";

// Provider that returns valid content on first call and throws on critique (second call)
function makeEnvThrowOnSecond() {
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
              if (after > Number(body.refuseAt || 0)) return new Response(JSON.stringify({ ok: false, current: cur }), { headers: { "content-type":"application/json" } });
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
              if (cur + Number(body.delta || 1) > limit) return new Response(JSON.stringify({ ok: false, count: cur }), { headers: { "content-type":"application/json" } });
              const next = cur + Number(body.delta || 1);
              put(next);
              return new Response(JSON.stringify({ ok: true, count: next }), { headers: { "content-type":"application/json" } });
            }
            return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { "content-type":"application/json" } });
          }
        };
      }
    };
  }
  return {
    SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
    SYNERGI_PROVIDER: "mock-throw-crit",
    SYNERGI_MODEL: "mock-mini",
    SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 1, outputPer1k: 1 } }),
    SYNERGI_SPEND_CAP_SEK: "100",
    SYNERGI_SPEND_REFUSE_AT_SEK: "100",
    SYNERGI_MAX_INPUT_TOKENS: "100",
    SYNERGI_MAX_OUTPUT_TOKENS: "100",
    SYNERGI_COUNTER: makeDoBinding()
  };
}

test("call-1 usage is settled even if call-2 throws (fail-first)", async () => {
  const env = makeEnvThrowOnSecond();
  const h = { origin: "https://mediahiveab.com", "cf-connecting-ip": "7.7.7.7" };
  const req = {
    json: async () => ({ a: { name: "A" }, bList: [{ name: "B" }] }),
    headers: { get: (k) => h[k.toLowerCase()] },
    method: "POST",
    url: "https://mediahiveab.com/api/synergimotor"
  };
  const r = await onRequestPost({ request: req, env });
  const j = await r.json();
  assert.equal(r.status, 502);
  // One successful first call should account for usage: 200 in + 300 out = 0.5 SEK (with our mock price 1/1 => 0.5)
  // The mock provider reports 200/300 tokens for the first call; second call throws before usage is recorded.
  assert.ok(j.meta && j.meta.estimatedSek > 0, "estimatedSek should reflect first call usage");
});

