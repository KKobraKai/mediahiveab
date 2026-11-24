import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/synergimotor.js";

function req(body, headers = {}) {
  const h = new Map(Object.entries(headers));
  return {
    json: async () => body,
    headers: { get: (k) => h.get(k) },
    method: "POST",
    url: "https://mediahiveab.com/api/synergimotor"
  };
}

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
          if (op === "get") {
            return new Response(JSON.stringify({ ok: true, current: get() }), { headers: { "content-type":"application/json" } });
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

test("handler: call-1 returns error-content (not_json) -> reservation settled to actual usage", async () => {
  // Mock OpenAI: first call returns NOT_JSON content with usage, causing chain failure with usage populated
  const prev = global.fetch;
  global.fetch = async function(url, opts) {
    const u = String(url);
    if (u.endsWith("/v1/chat/completions")) {
      const body = { choices: [{ message: { content: "NOT_JSON" } }], usage: { prompt_tokens: 100, completion_tokens: 50 } };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type":"application/json" } });
    }
    return { ok: true, status: 200, headers: new Map([["content-type","text/plain"]]), arrayBuffer: async () => Buffer.from("") };
  };
  try {
    const m = new Map();
    const env = {
      SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
      SYNERGI_PROVIDER: "openai",
      OPENAI_API_KEY: "k",
      OPENAI_BASE_URL: "https://example.com",
      SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "openai:gpt-4o-mini": { inputPer1k: 1, outputPer1k: 1 } }),
      SYNERGI_SPEND_CAP_SEK: "100",
      SYNERGI_SPEND_REFUSE_AT_SEK: "100",
      SYNERGI_MAX_INPUT_TOKENS: "100",
      SYNERGI_MAX_OUTPUT_TOKENS: "100",
      SYNERGI_COUNTER: makeDoBinding()
    };
    const r = await onRequestPost({ request: req({ a: { name:"A" }, bList: [{ name:"B"}] }, { origin: "https://mediahiveab.com", "cf-connecting-ip":"1.2.3.4" }), env });
    const j = await r.json();
    assert.equal(r.status, 502);
    // expected settled spend: (100+50)/1000 * 1 = 0.150
    const spend = Number((j.meta && j.meta.spendMonth).toFixed(3));
    assert.equal(spend, 0.150);
  } finally {
    global.fetch = prev;
  }
});

