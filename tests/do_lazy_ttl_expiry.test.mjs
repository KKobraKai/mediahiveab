import test from "node:test";
import assert from "node:assert/strict";
import { SynergiCounter } from "../functions/_lib/counter.js";

function makeState() {
  const m = new Map();
  return {
    _map: m,
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

test("lazy TTL expiry: expired entry is treated as expired and cleared", async () => {
  const st = makeState();
  const doInst = new SynergiCounter(st, {});
  const key = "ttl";
  // Manually write an expired record
  await st.storage.put(key, JSON.stringify({ v: 42, exp: Date.now() - 1000 }));
  // get should see 0 and delete it
  let r = await doInst.fetch(makeReq("get", { key }));
  let j = await r.json();
  assert.equal(j.current, 0, "expired value should be treated as 0");
  // Subsequent increment should start from 0
  r = await doInst.fetch(makeReq("inc", { key, delta: 1, limit: 10, ttl: 60 }));
  j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.count, 1);
});

