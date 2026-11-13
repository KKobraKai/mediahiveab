import test from "node:test";
import assert from "node:assert/strict";
import { runSynergyChain } from "../functions/_lib/chain.js";

function makeEnv() {
  const m = new Map();
  return {
    SYNERGI_PROVIDER: "mock",
    SYNERGI_MODEL: "mock-mini",
    SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
    SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 0, outputPer1k: 0 } })
  };
}

test("Mario + Liviu -> Solar Share", async () => {
  const env = makeEnv();
  const a = { name: "Mario Lovstrand", company: "Stenvalvet", category: "Fastighetsförvaltare" };
  const bList = [{ name: "Liviu Voinea", company: "Solkraft Direkt", category: "Solenergi" }];
  const res = await runSynergyChain({ env, a, bList, goal: "Grönare fastigheter", region: "Västmanland", costState: {} });
  assert.equal(res.ok, true, res.error || "");
  const m = res.result.matches[0];
  assert.ok(/solar share/i.test(m.name));
});

test("Roofer + Gutter firm", async () => {
  const env = makeEnv();
  const a = { name: "Anna", company: "TakExperten", category: "Takläggare" };
  const bList = [{ name: "Bo", company: "Rännorna AB", category: "Hängrännefirma" }];
  const res = await runSynergyChain({ env, a, bList, goal: "", region: "", costState: {} });
  assert.equal(res.ok, true);
  assert.ok(res.result.matches.length >= 1);
});

test("Cleaning + Property manager", async () => {
  const env = makeEnv();
  const a = { name: "Clara", company: "Städproffsen", category: "Städfirma" };
  const bList = [{ name: "Per", company: "Brf Förvaltning", category: "Fastighetsförvaltare" }];
  const res = await runSynergyChain({ env, a, bList, goal: "", region: "", costState: {} });
  assert.equal(res.ok, true);
});

test("Sign shop + Real estate agent", async () => {
  const env = makeEnv();
  const a = { name: "Sara", company: "Skylt & Co", category: "Skyltfirma" };
  const bList = [{ name: "Rickard", company: "Mäklare", category: "Fastighetsmäklare" }];
  const res = await runSynergyChain({ env, a, bList, goal: "", region: "", costState: {} });
  assert.equal(res.ok, true);
});

