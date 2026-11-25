import test from "node:test";
import assert from "node:assert/strict";
import { incIpRateLimit, reserveMonthlySpend, nowYM } from "../functions/_lib/cost.js";

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
          return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { "content-type":"application/json" } });
        }
      };
    }
  };
}

test("atomic concurrency for rate limit with Durable Object", async () => {
  const env = {
    SYNERGI_COUNTER: makeDoBinding(),
    SYNERGI_KV: { async get(){ return null; }, async put(){ } },
    SYNERGI_RATE_LIMIT_PER_IP_PER_DAY: "5"
  };
  const h = new Map([["cf-connecting-ip","2.2.2.2"]]);
  const req = { headers: { get: k => h.get(k) } };
  const results = await Promise.all(Array.from({ length: 10 }, () => incIpRateLimit(env, req)));
  const okCount = results.filter(r => r.ok).length;
  assert.equal(okCount, 5, "exactly limit successes should pass");
});

test("atomic monthly reservation refuses beyond cap", async () => {
  const env = {
    SYNERGI_COUNTER: makeDoBinding(),
    SYNERGI_KV: { async get(){ return null; }, async put(){ } },
    SYNERGI_SPEND_CAP_SEK: "10",
    SYNERGI_SPEND_REFUSE_AT_SEK: "1"
  };
  const resv = await Promise.all(Array.from({ length: 10 }, () => reserveMonthlySpend(env, 0.5)));
  const okCount = resv.filter(x => x.ok).length;
  assert.equal(okCount, 2, "only two reservations of 0.5 should pass under 1 SEK refuseAt");
});

