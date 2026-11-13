// Provider abstraction for Synergimotor
// Supports: mock, stdin (CLI), and OpenAI-compatible chat completions
const DEFAULT_API_BASE = "https://api.openai.com";

export function createProvider(env, opts = {}) {
  const provider = (env.SYNERGI_PROVIDER || "openai").toLowerCase();
  const model = env.SYNERGI_MODEL || "gpt-4o-mini";
  const priceTableJson = env.SYNERGI_PRICE_TABLE_JSON || "";
  let priceTable = {};
  try { if (priceTableJson) priceTable = JSON.parse(priceTableJson); } catch {}

  if (provider === "mock") {
    return new MockProvider({ model, priceTable });
  }
  if (provider === "stdin") {
    return new StdinProvider({ model, priceTable });
  }
  if (provider === "mock-invalid") {
    return new MockInvalidProvider({ model, priceTable });
  }
  if (provider === "mock-count") {
    return new MockCountingProvider({ model, priceTable });
  }
  if (provider === "mock-generic") {
    return new MockGenericProvider({ model, priceTable });
  }
  // default: OpenAI-compatible
  const apiKey = env.OPENAI_API_KEY;
  const apiBase = (env.OPENAI_BASE_URL || DEFAULT_API_BASE).replace(/\/+$/, "");
  return new OpenAICompatProvider({ apiKey, apiBase, model, priceTable });
}

export function priceForUsage(priceTable, providerName, model, usage) {
  // priceTable: { "<provider>:<model>": { inputPer1k: SEK, outputPer1k: SEK } }
  const key = `${providerName}:${model}`;
  // Defaults representing mini-class pricing per 1k tokens in SEK (OpenAI gpt-4o-mini circa 2026: ~$0.15/$0.60 per 1M tokens)
  const defaultMini = { inputPer1k: 0.0016, outputPer1k: 0.0064 };
  const p = priceTable[key] || (providerName === "openai" && /gpt-4o-mini/.test(model) ? defaultMini : defaultMini);
  const inK = (usage.promptTokens || usage.inputTokens || 0) / 1000;
  const outK = (usage.completionTokens || usage.outputTokens || 0) / 1000;
  return inK * p.inputPer1k + outK * p.outputPer1k;
}

class MockProvider {
  constructor({ model, priceTable }) {
    this.model = model || "mock-mini";
    this.priceTable = priceTable || {};
    this.name = "mock";
  }
  async chat({ messages, responseJson = true }) {
    // Deterministic tiny response for tests/fixtures based on inputs present in messages
    const allText = messages.map(m => m.content).join("\n").toLowerCase();
    let content = {};
    if ((allText.includes("mario") && allText.includes("lovstrand") && allText.includes("liviu") && allText.includes("voinea")) || allText.includes("solar share")) {
      content = mockSolarShareResponse();
    } else if (allText.includes("takläggare") && allText.includes("hängränne")) {
      content = mockSimplePair("Takläggare", "Hängrännefirma");
    } else if (allText.includes("städ") && allText.includes("fastighet")) {
      content = mockSimplePair("Städfirma", "Fastighetsförvaltare");
    } else if (allText.includes("skylt") && allText.includes("mäklare")) {
      content = mockSimplePair("Skyltfirma", "Fastighetsmäklare");
    } else {
      content = { matches: [], sources: ["Vendor figures"] };
    }
    const usage = { promptTokens: 200, completionTokens: 300 };
    return { provider: this.name, model: this.model, content, usage };
  }
}

class StdinProvider {
  constructor({ model, priceTable }) {
    this.model = model || "stdin-driver";
    this.priceTable = priceTable || {};
    this.name = "stdin";
  }
  async chat({ messages, responseJson = true }) {
    // For CLI: print prompt to stdout and read a single JSON object from stdin
    const prompt = messages.map(m => `# ${m.role.toUpperCase()}\n${m.content}`).join("\n\n");
    // eslint-disable-next-line no-console
    console.log("=== SYNERGIMOTOR PROMPT BEGIN ===\n" + prompt + "\n=== SYNERGIMOTOR PROMPT END ===");
    const text = await readStdinText();
    let content;
    try { content = JSON.parse(text); } catch (e) {
      content = { error: "stdin_not_json", raw: (text || "").slice(0, 8000) };
    }
    const usage = { promptTokens: 0, completionTokens: 0 };
    return { provider: this.name, model: this.model, content, usage };
  }
}

class MockInvalidProvider {
  constructor({ model, priceTable }) {
    this.model = model || "mock-mini";
    this.priceTable = priceTable || {};
    this.name = "mock";
  }
  async chat() {
    const usage = { promptTokens: 200, completionTokens: 100 };
    return { provider: this.name, model: this.model, content: { bad: true }, usage };
  }
}

class MockCountingProvider {
  constructor({ model, priceTable }) {
    this.model = model || "mock-mini";
    this.priceTable = priceTable || {};
    this.name = "mock";
    globalThis.__synergi_calls__ = 0;
  }
  async chat() {
    globalThis.__synergi_calls__ = (globalThis.__synergi_calls__ || 0) + 1;
    const usage = { promptTokens: 1, completionTokens: 1 };
    // Return minimal valid structure
    return {
      provider: this.name,
      model: this.model,
      content: {
        matches: [{
          id: "ok",
          name: "Ok",
          oneLine: "Ok",
          howItWorks: "Ok",
          parties: [{ name: "A", valueKrRange: [1, 2], gets: ["x"] }, { name: "B", valueKrRange: [1, 2], gets: ["y"] }],
          domino: [],
          firstSteps: ["1","2","3"],
          introMessage: "hi",
          bniPitch: "p",
          assumptions: { a: { label: "a", value: 1 } },
          valueModel: { A: { minFormula: "a*1", maxFormula: "a*2" }, B: { minFormula: "a*1", maxFormula: "a*2" } }
        }],
        sources: ["Vendor"]
      },
      usage
    };
  }
}

class MockGenericProvider {
  constructor({ model, priceTable }) {
    this.model = model || "mock-mini";
    this.priceTable = priceTable || {};
    this.name = "mock";
  }
  async chat() {
    const usage = { promptTokens: 150, completionTokens: 200 };
    return {
      provider: this.name,
      model: this.model,
      content: {
        matches: [{
          id: "g1",
          name: "Bundle & Upsell",
          oneLine: "Cross-sell bundles",
          howItWorks: "Generic",
          parties: [{ name: "A", valueKrRange: [100, 200], gets: ["x"] }, { name: "B", valueKrRange: [50, 100], gets: ["y"] }],
          domino: [],
          firstSteps: ["1", "2", "3"],
          introMessage: "Hi",
          bniPitch: "Pitch",
          assumptions: { a: { label: "a", value: 1 } },
          valueModel: { A: { minFormula: "a*1", maxFormula: "a*2" }, B: { minFormula: "a*1", maxFormula: "a*2" } }
        }],
        sources: ["Vendor figures"]
      },
      usage
    };
  }
}

class OpenAICompatProvider {
  constructor({ apiKey, apiBase, model, priceTable }) {
    this.apiKey = apiKey;
    this.apiBase = apiBase;
    this.model = model;
    this.priceTable = priceTable || {};
    this.name = "openai";
  }
  async chat({ messages, responseJson = true, maxOutputTokens = 800 }) {
    if (!this.apiKey) {
      return { provider: this.name, model: this.model, error: "api_key_missing", usage: { promptTokens: 0, completionTokens: 0 } };
    }
    const url = `${this.apiBase}/v1/chat/completions`;
    const body = {
      model: this.model,
      messages,
      temperature: 0.2,
      max_tokens: maxOutputTokens,
      response_format: responseJson ? { type: "json_object" } : undefined
    };
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      return { provider: this.name, model: this.model, error: "upstream_" + r.status, usage: { promptTokens: 0, completionTokens: 0 } };
    }
    const j = await r.json();
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || "";
    let content = text;
    if (responseJson) {
      try { content = JSON.parse(text); } catch (e) { content = { error: "not_json", raw: text.slice(0, 4000) }; }
    }
    const usage = {
      promptTokens: (j.usage && (j.usage.prompt_tokens || j.usage.input_tokens)) || 0,
      completionTokens: (j.usage && (j.usage.completion_tokens || j.usage.output_tokens)) || 0
    };
    return { provider: this.name, model: this.model, content, usage };
  }
}

async function readStdinText() {
  // In Workers there is no stdin; in Node CLI we read process.stdin if available
  if (typeof process !== "undefined" && process.stdin) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  }
  return "";
}

// ---- Mock fixtures
function mockSimplePair(aName, bName) {
  return {
    matches: [{
      id: "pair-" + aName + "-" + bName,
      name: aName + " + " + bName + ": paketaffärer",
      oneLine: "Sälj gemensamma paket där kunden får ett komplett jobb utan att jaga flera leverantörer.",
      howItWorks: `${aName} säljer totaljobb och ${bName} är underleverantör. Intäkter delas enligt avtal.`,
      parties: [
        { name: aName, valueKrRange: [5000, 45000], gets: ["Fler affärer", "Högre snitt per kund"] },
        { name: bName, valueKrRange: [3000, 30000], gets: ["Fyller luckor", "Pipeline från partner"] }
      ],
      domino: ["Drar in ytterligare hantverkare", "Samarbete med fastighetsägare"],
      firstSteps: ["Lista topp-5 paket", "Välj pilotkund", "Skriv enkel intäktsdelning"],
      introMessage: `Hej! Ska vi erbjuda paket där vi löser allt åt kunden tillsammans?`,
      bniPitch: "Jag söker en partner i " + bName + " för paketaffärer där kunden får allt klart.",
      assumptions: { paket_per_manad: { label: "Paket per månad", value: 4, unit: "st" }, vinst_per_paket: { label: "Vinst per paket", value: 2500, unit: "kr" } },
      valueModel: { [aName]: { minFormula: "paket_per_manad * vinst_per_paket * 6", maxFormula: "paket_per_manad * vinst_per_paket * 18" }, [bName]: { minFormula: "paket_per_manad * vinst_per_paket * 4", maxFormula: "paket_per_manad * vinst_per_paket * 12" } }
    }],
    sources: ["Branschdata (leverantörsuppgift)"]
  };
}

function mockSolarShareResponse() {
  const A = "Stenvalvet (fastighetsägare)", B = "Solkraft Direkt (solenergi)";
  return {
    matches: [{
      id: "solar-share",
      name: "Solar Share – hyresgästnära solel",
      oneLine: "Fastighetsägaren upplåter tak/mark för solpaneler; hyresgäster och personal köper andelar mot sin elräkning.",
      howItWorks: "Fastighetsägaren upplåter tak/mark och försäljningskanal till hyresgästerna. Solbolaget projekterar, installerar och driver anläggningen. Hyresgäster och anställda köper andelar via elhandelsavtal; ersättning krediteras deras elräkning.",
      parties: [
        { name: A, valueKrRange: [50000, 600000], gets: ["Grön profil", "Intäkter från markupplåtelse", "Stabilare hyresrelationer"] },
        { name: B, valueKrRange: [80000, 700000], gets: ["Skalbar pipeline", "Lägre CAC via fastighetsägare"] }
      ],
      domino: ["Bank/finansiering", "Elhandelsbolag", "Nästa fastighetsägare via referenscase"],
      firstSteps: ["Val av referensfastighet", "Takbesiktning och solpotential", "MOU om andelsmodell och intäktsdelning"],
      introMessage: "Hej! Idé: Solar Share där ni upplåter tak och vi säljer andelar till hyresgästerna. Ni får hyresnära klimatnytta och ersättning för tak/mark, vi tar projektering och drift. Ska vi ta ett 20-min möte?",
      bniPitch: "Jag söker kontakt med en fastighetsägare som vill testa 'Solar Share': upplåta tak för solel där hyresgäster köper andelar och ser avdraget på sin elräkning.",
      assumptions: {
        takyta_kvm: { label: "Tillgänglig takyta", value: 1200, unit: "kvm" },
        kw_per_kvm: { label: "Installerad effekt per kvm", value: 0.18, unit: "kW/kvm" },
        pris_per_kw: { label: "Investering per kW", value: 11000, unit: "kr/kW" },
        andel_pris: { label: "Andelspris", value: 5000, unit: "kr" },
        andelar: { label: "Antal andelar (försäljning)", value: 300, unit: "st" },
        ers_tak_kr_per_kvm: { label: "Ersättning tak/mark", value: 40, unit: "kr/kvm/år" }
      },
      valueModel: {
        [A]: { minFormula: "takyta_kvm * ers_tak_kr_per_kvm * 1", maxFormula: "takyta_kvm * ers_tak_kr_per_kvm * 3" },
        [B]: { minFormula: "andel_pris * andelar * 0.08", maxFormula: "andel_pris * andelar * 0.25" }
      }
    }],
    sources: ["SCB hushållsel (indikerande)", "Skatteverket grönt avdrag (regelverk)", "Leverantörsuppgift: typisk investeringskostnad kr/kW"]
  };
}

