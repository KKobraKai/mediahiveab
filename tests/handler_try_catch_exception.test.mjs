import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/synergimotor.js";

function makeDoBinding() {
  const store = new Map();
  return {
    idFromName(name) { return { name }; },
    get(_id) {
      return {
        async fetch(req) {
          const url = new URL(req.url);
          const op = url.pathname.split("/").pop();
          const body = await req.json();
          const key = body.key;
          const get = () => Number(store.get(key) || 0);
          const put = (v) => { store.set(key, String(v)); };
          if (op === "inc") {
            const cur = get();
            const limit = Number(body.limit || Infinity);
            if (cur + Number(body.delta || 1) > limit) {
              return new Response(JSON.stringify({ ok: false, count: cur }), { headers: { "content-type":"application/json" } });
            }
            const next = cur + Number(body.delta || 1);
            put(next);
            return new Response(JSON.stringify({ ok: true, count: next }), { headers: { "content-type":"application/json" } });
          }
          if (op === "reserve") {
            const cur = get();
            const after = cur + Number(body.amount || 0);
            if (after > Number(body.refuseAt || 0)) {
              return new Response(JSON.stringify({ ok: false, current: cur }), { headers: { "content-type":"application/json" } });
            }
            put(after);
            return new Response(JSON.stringify({ ok: true, current: after }), { headers: { "content-type":"application/json" } });
          }
          if (op === "adjust") {
            const cur = get();
            const next = Math.max(0, cur + Number(body.delta || 0));
            put(next);
            return new Response(JSON.stringify({ ok: true, current: next }), { headers: { "content-type":"application/json" } });
          }
          return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { "content-type":"application/json" } });
        }
      };
    }
  };
}

function makeEnv(overrides = {}) {
  const m = new Map();
  return {
    SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
    SYNERGI_PROVIDER: "openai",
    OPENAI_API_KEY: "testkey",
    OPENAI_BASE_URL: "https://api.example.invalid",
    SYNERGI_MODEL: "gpt-4o-mini",
    SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "openai:gpt-4o-mini": { inputPer1k: 0.0016, outputPer1k: 0.0064 } }),
    SYNERGI_SPEND_CAP_SEK: "100",
    SYNERGI_SPEND_REFUSE_AT_SEK: "100",
    SYNERGI_MAX_INPUT_TOKENS: "3000",
    SYNERGI_MAX_OUTPUT_TOKENS: "3000",
    SYNERGI_COUNTER: makeDoBinding(),
    ...overrides
  };
}

function makeReq(body, headers = {}) {
  const h = new Map(Object.entries(headers));
  return {
    json: async () => body,
    headers: { get: (k) => h.get(k) },
    method: "POST",
    url: "https://mediahiveab.com/api/synergimotor"
  };
}

test("handler try/catch returns 502 on thrown chain and releases reservation", async () => {
  // Force the provider's first chat call to throw (simulate network failure)
  const prevFetch = global.fetch;
  global.fetch = async function() { throw new Error("network_down"); };
  try {
    const env = makeEnv();
    const req = makeReq({ a: { name: "A" }, bList: [{ name: "B" }] }, { origin: "https://mediahiveab.com", "cf-connecting-ip": "1.1.1.1" });
    const r = await onRequestPost({ request: req, env });
    const j = await r.json();
    assert.equal(r.status, 502);
    assert.equal(j.error, "exception");
    // After catching the exception, settlement should release the worst-case reservation back to 0
    assert.equal(Number((j.meta && j.meta.spendMonth).toFixed(3)), 0.000);
  } finally {
    global.fetch = prevFetch;
  }
});

