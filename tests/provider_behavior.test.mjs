import test from "node:test";
import assert from "node:assert/strict";
import { runSynergyChain } from "../functions/_lib/chain.js";

test("passes maxOut to provider (OpenAI compat)", async () => {
  const seen = [];
  const prev = global.fetch;
  global.fetch = async function(url, opts) {
    const body = JSON.parse(opts.body);
    seen.push(body.max_tokens);
    // Return minimal valid JSON response
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ matches: [{ id:"1", name:"x", oneLine:"y", howItWorks:"z", parties:[{ name:"A", valueKrRange:[1,2], gets:["x"] }, { name:"B", valueKrRange:[1,2], gets:["y"] }], domino:[], firstSteps:["1","2","3"], introMessage:"i", bniPitch:"p", assumptions:{ a:{ label:"L", value:1}}, valueModel:{ A:{ minFormula:"a*1", maxFormula:"a*1"}, B:{ minFormula:"a*1", maxFormula:"a*1"}} }], sources:["SCB"] }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const env = { SYNERGI_PROVIDER: "openai", OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://example.com", SYNERGI_MAX_OUTPUT_TOKENS: "123", SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "openai:gpt-4o-mini": { inputPer1k: 0, outputPer1k: 0 } }) };
    const r = await runSynergyChain({ env, a: { name:"A" }, bList: [{ name:"B"}], goal:"", region:"", costState: {} });
    assert.equal(r.ok, true);
    assert.ok(seen.every(v => v === 123), "max_tokens must equal env SYNERGI_MAX_OUTPUT_TOKENS");
  } finally {
    global.fetch = prev;
  }
});

test("critique call happens (two model calls)", async () => {
  globalThis.__synergi_calls__ = 0;
  const env = {
    SYNERGI_PROVIDER: "mock-count",
    SYNERGI_MODEL: "mock-mini",
    SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 0, outputPer1k: 0 } })
  };
  const r = await runSynergyChain({ env, a: { name: "A" }, bList: [{ name: "B" }], goal: "", region: "", costState: {} });
  assert.equal(r.ok, true);
  assert.equal(globalThis.__synergi_calls__, 2);
});

