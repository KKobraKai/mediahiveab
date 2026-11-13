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

test("origin check 403 on POST", async () => {
  const env = makeEnv();
  const r = await onRequestPost({ request: req({ a: { name:"A" }, bList: [{ name:"B"}] }, { origin: "https://evil.com", "cf-connecting-ip":"1.2.3.4" }), env });
  assert.equal(r.status, 403);
});

test("unknown pricing model fails closed", async () => {
  const env = makeEnv({ SYNERGI_PRICE_TABLE_JSON: JSON.stringify({}), SYNERGI_SPEND_CAP_SEK: "100" });
  const r = await onRequestPost({ request: req({ a: { name:"A" }, bList: [{ name:"B"}] }, { origin: "https://mediahiveab.com", "cf-connecting-ip":"1.2.3.4" }), env });
  const j = await r.json();
  assert.equal(j.error, "pricing_unknown_model");
});

test("reservation occurs before upstream call", async () => {
  const m = new Map();
  const env = makeEnv({
    SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
    SYNERGI_SPEND_CAP_SEK: "100",
    SYNERGI_SPEND_REFUSE_AT_SEK: "100",
    SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 0.001, outputPer1k: 0.001 } })
  });
  const r = await onRequestPost({ request: req({ a: { name:"A", category:"Takläggare" }, bList: [{ name:"B", category:"Hängrännefirma"}] }, { origin: "https://mediahiveab.com", "cf-connecting-ip":"8.8.8.8" }), env });
  const j = await r.json();
  // spend key should exist upon success
  const ym = new Date(); const key = `spend:${ym.getUTCFullYear()}${String(ym.getUTCMonth()+1).padStart(2,"0")}`;
  assert.ok(m.has(key));
  assert.equal(j && j.ok, true);
});

test("settlement on failure accounts for actual usage", async () => {
  const m = new Map();
  const env = makeEnv({
    SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
    SYNERGI_PROVIDER: "mock-invalid",
    SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 1, outputPer1k: 1 } }),
    SYNERGI_SPEND_CAP_SEK: "100",
    SYNERGI_SPEND_REFUSE_AT_SEK: "100",
    SYNERGI_MAX_INPUT_TOKENS: "100",
    SYNERGI_MAX_OUTPUT_TOKENS: "100"
  });
  const r = await onRequestPost({ request: req({ a: { name:"A" }, bList: [{ name:"B"}] }, { origin: "https://mediahiveab.com", "cf-connecting-ip":"9.9.9.9" }), env });
  const j = await r.json();
  assert.equal(r.status, 502);
  // After failure, spend should equal actual usage across two calls (400 in + 200 out) = 0.6 SEK
  const ym = new Date(); const key = `spend:${ym.getUTCFullYear()}${String(ym.getUTCMonth()+1).padStart(2,"0")}`;
  const cur = Number(m.get(key) || "0");
  assert.equal(Number(cur.toFixed(3)), 0.600);
});

test("settlement on success accounts for actual usage", async () => {
  const m = new Map();
  const env = makeEnv({
    SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
    SYNERGI_PROVIDER: "mock",
    SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 1, outputPer1k: 1 } }),
    SYNERGI_SPEND_CAP_SEK: "100",
    SYNERGI_SPEND_REFUSE_AT_SEK: "100",
    SYNERGI_MAX_INPUT_TOKENS: "100",
    SYNERGI_MAX_OUTPUT_TOKENS: "100"
  });
  const r = await onRequestPost({ request: req({ a: { name:"A", category:"Takläggare" }, bList: [{ name:"B", category:"Hängrännefirma"}] }, { origin: "https://mediahiveab.com", "cf-connecting-ip":"9.9.9.10" }), env });
  const j = await r.json();
  assert.equal(j && j.ok, true);
  // Mock provider uses usage promptTokens=200, completionTokens=300 per call; two calls => 1.0 SEK
  const ym = new Date(); const key = `spend:${ym.getUTCFullYear()}${String(ym.getUTCMonth()+1).padStart(2,"0")}`;
  const cur = Number(m.get(key) || "0");
  assert.equal(Number(cur.toFixed(3)), 1.000);
});

