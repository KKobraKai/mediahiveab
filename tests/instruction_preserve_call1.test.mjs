import test from "node:test";
import assert from "node:assert/strict";
import { runSynergyChain } from "../functions/_lib/chain.js";

test("instruction text is preserved in first model call with large site text", async () => {
  let callCount = 0;
  let seenFirstBody = null;
  const prev = global.fetch;
  global.fetch = async function(url, opts) {
    const u = String(url);
    if (u.endsWith("/v1/chat/completions")) {
      callCount++;
      const body = JSON.parse(opts.body);
      if (callCount === 1) seenFirstBody = body;
      return new Response(JSON.stringify({ id: "x", choices: [{ message: { content: JSON.stringify({ matches: [{ id:"1", name:"x", oneLine:"y", howItWorks:"z", parties:[{ name:"A", valueKrRange:[1,2], gets:["x"] }, { name:"B", valueKrRange:[1,2], gets:["y"] }], domino:[], firstSteps:["1","2","3"], introMessage:"i", bniPitch:"p", assumptions:{ a:{ label:"L", value:1}}, valueModel:{ A:{ minFormula:"a*1", maxFormula:"a*1"}, B:{ minFormula:"a*1", maxFormula:"a*1"}} }], sources:["SCB"] }) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    // Website fetch big content
    if (u.startsWith("http://") || u.startsWith("https://")) {
      return {
        headers: new Map([["content-type","text/html"]]),
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from("z".repeat(400_000), "utf8")
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
      SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "openai:gpt-4o-mini": { inputPer1k: 0, outputPer1k: 0 } })
    };
    const a = { name:"A", website:"https://a.example" };
    const bList = [{ name:"B", website:"https://b.example" }];
    const r = await runSynergyChain({ env, a, bList, goal:"g", region:"r", costState: {} });
    assert.equal(r.ok, true);
    const text = seenFirstBody.messages.map(m => m.content).join("\n");
    // The instruction contains the word "Format:" and the phrase "Returnera de 3–5 bästa"
    assert.ok(/Format:/.test(text), "instruction 'Format:' must be present in first call");
    assert.ok(/Returnera de 3–5 bästa/.test(text), "instruction 'Returnera de 3–5 bästa' must be present");
  } finally {
    global.fetch = prev;
  }
});

