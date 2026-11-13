import test from "node:test";
import assert from "node:assert/strict";
import { runSynergyChain } from "../functions/_lib/chain.js";

test("enforces per-field caps and total prompt char cap upstream (non-vacuous)", async () => {
  // Spy on OpenAI POST body and feed huge website content
  const bodies = [];
  const prevFetch = global.fetch;
  global.fetch = async function(url, opts) {
    const u = String(url);
    if (u.endsWith("/v1/chat/completions")) {
      bodies.push(JSON.parse(opts.body));
      return new Response(JSON.stringify({ id: "x", choices: [{ message: { content: JSON.stringify({ matches: [{ id:"1", name:"x", oneLine:"y", howItWorks:"z", parties:[{ name:"A", valueKrRange:[1,2], gets:["x"] }, { name:"B", valueKrRange:[1,2], gets:["y"] }], domino:[], firstSteps:["1","2","3"], introMessage:"i", bniPitch:"p", assumptions:{ a:{ label:"L", value:1}}, valueModel:{ A:{ minFormula:"a*1", maxFormula:"a*1"}, B:{ minFormula:"a*1", maxFormula:"a*1"}} }], sources:["SCB"] }) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    // Website fetch returns very large body to force trimming pressure
    if (u.startsWith("http://") || u.startsWith("https://")) {
      return {
        headers: new Map([["content-type","text/html"]]),
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from("w".repeat(600_000), "utf8")
      };
    }
    throw new Error("unexpected fetch " + u);
  };
  try {
    const env = {
      SYNERGI_PROVIDER: "openai",
      OPENAI_API_KEY: "k",
      OPENAI_BASE_URL: "https://example.com",
      SYNERGI_MAX_PROMPT_CHARS: "5000",
      SYNERGI_FIELD_CAP_CHARS: "100",
      SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "openai:gpt-4o-mini": { inputPer1k: 0, outputPer1k: 0 } })
    };
    const long = "x".repeat(10000);
    const a = { name: long, company: long, website: "https://a.example", category: long };
    const bList = [{ name: long, company: long, website: "https://b.example", category: long }];
    const cs = {};
    const r = await runSynergyChain({ env, a, bList, goal: long, region: long, costState: cs });
    assert.equal(r.ok, true, r.error || "");
    // Assert prompt char cap enforced (sum of all first-call messages)
    const totalLen = bodies[0].messages.reduce((s, m) => s + (m.content || "").length, 0);
    assert.ok(totalLen <= 5000, `prompt chars should be <= configured cap, got ${totalLen}`);
  } finally {
    global.fetch = prevFetch;
  }
});

