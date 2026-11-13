import test from "node:test";
import assert from "node:assert/strict";
import { reserveMonthlySpend, adjustMonthlySpend, nowYM } from "../functions/_lib/cost.js";

test("KV write failure does not leak reservation", async () => {
  const m = new Map();
  const env = {
    SYNERGI_KV: {
      async get(k){ return m.get(k)||null; },
      async put(k,v){ throw new Error("write_limit"); }
    },
    SYNERGI_SPEND_CAP_SEK: "100",
    SYNERGI_SPEND_REFUSE_AT_SEK: "10"
  };
  const r = await reserveMonthlySpend(env, 1.0);
  assert.equal(r.ok, false);
  const ym = nowYM(); const key = `spend:${ym}`;
  assert.equal(m.has(key), false, "no reservation persisted");
});

