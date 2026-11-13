import test from "node:test";
import assert from "node:assert/strict";
import { priceForUsage } from "../functions/_lib/provider.js";
import { getMonthlySpend, incIpRateLimit } from "../functions/_lib/cost.js";

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

// monthly cap via addMonthlySpend removed — DO-based reserve/adjust is exercised elsewhere

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

test("rate limit per ip per day", async () => {
  const env = { SYNERGI_KV: makeKv(), SYNERGI_RATE_LIMIT_PER_IP_PER_DAY: "2", SYNERGI_COUNTER: makeDoBinding() };
  const hmap = new Map([["cf-connecting-ip","1.2.3.4"]]);
  const req = { headers: { get: (k) => hmap.get(k) } };
  let r = await incIpRateLimit(env, req); assert.equal(r.ok, true);
  r = await incIpRateLimit(env, req); assert.equal(r.ok, true);
  r = await incIpRateLimit(env, req); assert.equal(r.ok, false);
});

