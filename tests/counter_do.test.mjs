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

test("DO inc respects limit and refuse branches", async () => {
  const doInst = new SynergiCounter(makeState(), {});
  let r = await doInst.fetch(makeReq("inc", { key: "k", delta: 1, limit: 2, ttl: 60 }));
  let j = await r.json(); assert.equal(j.ok, true); assert.equal(j.count, 1);
  r = await doInst.fetch(makeReq("inc", { key: "k", delta: 1, limit: 2, ttl: 60 }));
  j = await r.json(); assert.equal(j.ok, true); assert.equal(j.count, 2);
  r = await doInst.fetch(makeReq("inc", { key: "k", delta: 1, limit: 2, ttl: 60 }));
  j = await r.json(); assert.equal(j.ok, false);
});

test("DO reserve refuses beyond refuseAt", async () => {
  const doInst = new SynergiCounter(makeState(), {});
  let r = await doInst.fetch(makeReq("reserve", { key: "s", amount: 0.5, refuseAt: 1, ttl: 60 }));
  let j = await r.json(); assert.equal(j.ok, true); assert.equal(j.current, 0.5);
  r = await doInst.fetch(makeReq("reserve", { key: "s", amount: 0.6, refuseAt: 1, ttl: 60 }));
  j = await r.json(); assert.equal(j.ok, false);
});

