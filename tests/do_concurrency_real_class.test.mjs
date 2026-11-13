import test from "node:test";
import assert from "node:assert/strict";
import { SynergiCounter } from "../functions/_lib/counter.js";

function makeState() {
  const m = new Map();
  return {
    storage: {
      async get(k){ return m.get(k)||null; },
      async put(k,v){ m.set(k,v); },
      async delete(k){ m.delete(k); }
    }
  };
}

function makeReq(op, body) {
  return new Request(`https://do/${op}`, { method: "POST", headers: { "content-type":"application/json" }, body: JSON.stringify(body) });
}

test("real DO class: concurrent inc respects limit", async () => {
  const doInst = new SynergiCounter(makeState(), {});
  const key = "lim";
  const tasks = Array.from({ length: 20 }, () => doInst.fetch(makeReq("inc", { key, delta: 1, limit: 5, ttl: 60 })));
  const rs = await Promise.all(tasks);
  const js = await Promise.all(rs.map(r => r.json()));
  const okCount = js.filter(j => j.ok).length;
  assert.equal(okCount, 5, "exactly limit successes should pass");
});

test("real DO class: concurrent reserve refuses beyond refuseAt", async () => {
  const doInst = new SynergiCounter(makeState(), {});
  const key = "res";
  const tasks = Array.from({ length: 20 }, () => doInst.fetch(makeReq("reserve", { key, amount: 0.1, refuseAt: 1.0, ttl: 60 })));
  const rs = await Promise.all(tasks);
  const js = await Promise.all(rs.map(r => r.json()));
  const okCount = js.filter(j => j.ok).length;
  assert.equal(okCount, 10, "ten reservations of 0.1 should pass under 1.0 refuseAt");
});

test("real DO class: clamp prevents negative on adjust under concurrency", async () => {
  const doInst = new SynergiCounter(makeState(), {});
  const key = "adj";
  // Start at 0; apply many negative adjustments
  const tasks = Array.from({ length: 20 }, () => doInst.fetch(makeReq("adjust", { key, delta: -1, ttl: 60 })));
  await Promise.all(tasks);
  const r = await doInst.fetch(makeReq("get", { key }));
  const j = await r.json();
  assert.equal(j.current, 0, "clamp must keep value at 0 or above");
});

