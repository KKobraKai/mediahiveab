import { runSynergyChain } from "./functions/_lib/chain.js";
import { createProvider } from "./functions/_lib/provider.js";
import { reserveMonthlySpend, adjustMonthlySpend } from "./functions/_lib/cost.js";
const m = new Map();
const env = {
  SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
  SYNERGI_PROVIDER: "mock",
  SYNERGI_MODEL: "mock-mini",
  SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 1, outputPer1k: 1 } }),
  SYNERGI_SPEND_CAP_SEK: "100",
  SYNERGI_SPEND_REFUSE_AT_SEK: "100",
  SYNERGI_MAX_INPUT_TOKENS: "100",
  SYNERGI_MAX_OUTPUT_TOKENS: "100"
};
const provider = createProvider(env);
const p = JSON.parse(env.SYNERGI_PRICE_TABLE_JSON)[`${provider.name}:${provider.model}`];
const calls = 2;
const maxIn = Math.min(Number(env.SYNERGI_MAX_INPUT_TOKENS)*calls, Math.ceil(Number(env.SYNERGI_MAX_PROMPT_CHARS || 16000)/4)*calls);
const maxOut = Number(env.SYNERGI_MAX_OUTPUT_TOKENS)*calls;
const worstSek = (maxIn/1000)*p.inputPer1k + (maxOut/1000)*p.outputPer1k;
console.log({ worstSek });
const resv = await reserveMonthlySpend(env, worstSek);
console.log("resv", resv, "map", m);
const cs = { worstSek };
const res = await runSynergyChain({ env, a: { name:"A", category:"Takläggare" }, bList: [{ name:"B", category:"Hängrännefirma"}], goal:"", region:"", costState: cs });
console.log("chain", res);
console.log("costState", cs);
const delta = (cs.estimatedSek || 0) - worstSek;
const adj = await adjustMonthlySpend(env, delta);
console.log("adj", adj, "final", m);
