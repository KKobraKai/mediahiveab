import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/synergimotor.js";

function makeEnvWithDoErrorOn(opName) {
  const m = new Map();
  const SYNERGI_COUNTER = {
    idFromName(name) { return { name }; },
    get(id) {
      return {
        async fetch(req) {
          const url = new URL(req.url);
          const op = url.pathname.split("/").pop();
          if (op === opName) {
            return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "content-type":"application/json" } });
          }
          // Happy path minimal for other ops
          const body = await req.json();
          const key = body.key;
          return new Response(JSON.stringify({ ok: true, current: 0, count: 0 }), { headers: { "content-type":"application/json" } });
        }
      };
    }
  };
  return {
    SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
    SYNERGI_PROVIDER: "mock",
    SYNERGI_MODEL: "mock-mini",
    SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 0, outputPer1k: 0 } }),
    SYNERGI_SPEND_CAP_SEK: "100",
    SYNERGI_SPEND_REFUSE_AT_SEK: "100",
    SYNERGI_RATE_LIMIT_PER_IP_PER_DAY: "5",
    SYNERGI_COUNTER
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

test("rate limit DO error fails closed with 503 (not 429)", async () => {
  const env = makeEnvWithDoErrorOn("inc");
  const r = await onRequestPost({ request: req({ a: { name:"A" }, bList: [{ name:"B"}] }, { origin: "https://mediahiveab.com", "cf-connecting-ip":"1.2.3.4" }), env });
  const j = await r.json();
  assert.equal(r.status, 503);
  assert.equal(j.error, "counter_unavailable");
});

test("reserve DO error yields 503 counter_unavailable", async () => {
  const env = makeEnvWithDoErrorOn("reserve");
  const r = await onRequestPost({ request: req({ a: { name:"A" }, bList: [{ name:"B"}] }, { origin: "https://mediahiveab.com", "cf-connecting-ip":"1.2.3.4" }), env });
  const j = await r.json();
  assert.equal(r.status, 503);
  assert.equal(j.error, "counter_unavailable");
});

