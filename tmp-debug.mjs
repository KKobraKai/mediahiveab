import { onRequestPost } from "./functions/api/synergimotor.js";
const m = new Map();
const env = {
  SYNERGI_KV: { async get(k){ return m.get(k)||null; }, async put(k,v){ m.set(k,v); } },
  SYNERGI_PROVIDER: "mock-invalid",
  SYNERGI_MODEL: "mock-mini",
  SYNERGI_PRICE_TABLE_JSON: JSON.stringify({ "mock:mock-mini": { inputPer1k: 1, outputPer1k: 1 } }),
  SYNERGI_SPEND_CAP_SEK: "100",
  SYNERGI_SPEND_REFUSE_AT_SEK: "100",
  SYNERGI_MAX_INPUT_TOKENS: "100",
  SYNERGI_MAX_OUTPUT_TOKENS: "100"
};
const headers = new Map([["origin","https://mediahiveab.com"], ["cf-connecting-ip","9.9.9.9"]]);
const request = { json: async () => ({ a: { name: "A" }, bList: [{ name: "B" }] }), headers: { get: (k) => headers.get(k) } };
const r = await onRequestPost({ request, env });
console.log("status", r.status);
const j = await r.json();
console.log("json", j);
console.log("spend", m);
