import test from "node:test";
import assert from "node:assert/strict";
import { priceForUsage } from "../functions/_lib/provider.js";
import { addMonthlySpend, getMonthlySpend, incIpRateLimit } from "../functions/_lib/cost.js";

function makeKv() {
  const m = new Map();
  return {
    async get(k) { return m.get(k) || null; },
    async put(k, v) { m.set(k, v); }
  };
}

test("price estimate sums input/output in SEK", () => {
  const table = { "openai:gpt-4o-mini": { inputPer1k: 1.6, outputPer1k: 6.4 } };
  const usage = { promptTokens: 500, completionTokens: 200 };
  const sek = priceForUsage(table, "openai", "gpt-4o-mini", usage);
  assert.ok(sek > 0);
  assert.equal(Number(sek.toFixed(3)), Number(((0.5*1.6)+(0.2*6.4)).toFixed(3)));
});

test("monthly cap refusal", async () => {
  const env = { SYNERGI_KV: makeKv(), SYNERGI_SPEND_CAP_SEK: "1" };
  const add1 = await addMonthlySpend(env, 0.4); assert.equal(add1.ok, true);
  const add2 = await addMonthlySpend(env, 0.6); assert.equal(add2.ok, true);
  const add3 = await addMonthlySpend(env, 0.1); assert.equal(add3.ok, false);
  const ms = await getMonthlySpend(env);
  assert.equal(Number(ms.current.toFixed(2)), 1.00);
});

test("rate limit per ip per day", async () => {
  const env = { SYNERGI_KV: makeKv(), SYNERGI_RATE_LIMIT_PER_IP_PER_DAY: "2" };
  const hmap = new Map([["cf-connecting-ip","1.2.3.4"]]);
  const req = { headers: { get: (k) => hmap.get(k) } };
  let r = await incIpRateLimit(env, req); assert.equal(r.ok, true);
  r = await incIpRateLimit(env, req); assert.equal(r.ok, true);
  r = await incIpRateLimit(env, req); assert.equal(r.ok, false);
});

