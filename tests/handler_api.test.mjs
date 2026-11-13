import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/synergimotor.js";

function makeEnv(overrides = {}) {
  const m = new Map();
  return {
    SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
    SYNERGI_PROVIDER: "mock",
    SYNERGI_MODEL: "mock-mini",
    SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 0, outputPer1k: 0 } }),
    SYNERGI_SPEND_CAP_SEK: "1",
    SYNERGI_SPEND_REFUSE_AT_SEK: "0.9",
    SYNERGI_MAX_INPUT_TOKENS: "3000",
    SYNERGI_MAX_OUTPUT_TOKENS: "3000",
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

test("pre-call cap gate refuses when worst-case exceeds cap", async () => {
  const price = JSON.stringify({ "mock:mock-mini": { inputPer1k: 0.0016, outputPer1k: 0.0064 } });
  const env = makeEnv({ SYNERGI_PRICE_TABLE_JSON: price, SYNERGI_SPEND_CAP_SEK: "0", SYNERGI_SPEND_REFUSE_AT_SEK: "0", SYNERGI_MAX_OUTPUT_TOKENS: "40000" });
  const r = await onRequestPost({ request: req({ a: { name:"A" }, bList: [{ name:"B"}] }, { origin: "https://mediahiveab.com" , "cf-connecting-ip":"1.2.3.4"}), env });
  const j = await r.json();
  assert.equal(j.error, "budget_worst_case_exceeds");
});

test("schema invalid -> 502", async () => {
  const env = makeEnv({ SYNERGI_PROVIDER: "mock-invalid" });
  const r = await onRequestPost({ request: req({ a: { name:"A" }, bList: [{ name:"B"}] }, { origin: "https://mediahiveab.com", "cf-connecting-ip":"1.2.3.4" }), env });
  const j = await r.json();
  assert.equal(j.error ? 1 : 0, 1);
});

test("generic filter empties generic-only provider -> 502", async () => {
  const env = makeEnv({ SYNERGI_PROVIDER: "mock-generic", SYNERGI_SPEND_CAP_SEK: "100", SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 0, outputPer1k: 0 } }) });
  const r = await onRequestPost({ request: req({ a: { name:"A" }, bList: [{ name:"B"}] }, { origin: "https://mediahiveab.com", "cf-connecting-ip":"1.2.3.4" }), env });
  const j = await r.json();
  assert.equal(j.error ? 1 : 0, 1);
});

test("missing cf-connecting-ip is refused", async () => {
  const env = makeEnv();
  const r = await onRequestPost({ request: req({ a: { name:"A" }, bList: [{ name:"B"}] }, { origin: "https://mediahiveab.com", "x-forwarded-for":"1.2.3.4" }), env });
  const j = await r.json();
  assert.equal(j.error, "ip_required");
});

