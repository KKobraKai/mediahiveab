import { createProvider } from "./functions/_lib/provider.js";
import { reserveMonthlySpend, adjustMonthlySpend } from "./functions/_lib/cost.js";
const m = new Map();
const env = {
  SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
  SYNERGI_PROVIDER: "mock-invalid",
  SYNERGI_MODEL: "mock-mini",
  SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 1, outputPer1k: 1 } }),
  SYNERGI_MAX_PROMPT_CHARS: "16000",
  SYNERGI_MAX_INPUT_TOKENS: "100",
  SYNERGI_MAX_OUTPUT_TOKENS: "100",
  SYNERGI_SPEND_CAP_SEK: "100",
  SYNERGI_SPEND_REFUSE_AT_SEK: "100"
};
const provider = createProvider(env);
const priceTable = JSON.parse(env.SYNERGI_PRICE_TABLE_JSON);
const key = `${provider.name}:${provider.model}`;
const p = priceTable[key];
const calls = 2;
const maxInFromPrompt = Math.ceil(Number(env.SYNERGI_MAX_PROMPT_CHARS)/4)*calls;
const maxInCfg = Number(env.SYNERGI_MAX_INPUT_TOKENS)*calls;
const maxIn = Math.min(maxInCfg, maxInFromPrompt);
const maxOut = Number(env.SYNERGI_MAX_OUTPUT_TOKENS)*calls;
const worstSek = (maxIn/1000)*p.inputPer1k + (maxOut/1000)*p.outputPer1k;
console.log({ key, maxIn, maxOut, worstSek });
const resv = await reserveMonthlySpend(env, worstSek);
console.log("reserve", resv, "map", m);
