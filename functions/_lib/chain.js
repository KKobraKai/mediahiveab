import { createProvider, priceForUsage } from "./provider.js";
import { SynergyResponse, isLikelyGeneric } from "./schema.js";

export async function fetchTextWithCap(url, capBytes = 120_000, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "accept": "text/html, text/plain" }, signal: ctrl.signal });
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return { text: "", bytes: 0, contentType: ct };
    const ab = await r.arrayBuffer();
    const buf = ab.byteLength > capBytes ? ab.slice(0, capBytes) : ab;
    const text = new TextDecoder("utf-8").decode(buf);
    return { text, bytes: buf.byteLength, contentType: ct };
  } catch (e) {
    return { text: "", bytes: 0, error: String(e && e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

function buildBusinessContext(a, bList, fetched) {
  const aStr = [
    a.name && `Namn: ${a.name}`,
    a.company && `Företag: ${a.company}`,
    a.website && `Webb: ${a.website}`,
    a.category && `BNI-kategori: ${a.category}`,
    fetched[a.website || ""]?.text && `Webbplats (utdrag):\n${fetched[a.website].text.slice(0, 4000)}`
  ].filter(Boolean).join("\n");
  const bs = bList.map((b, i) => ([
    b.name && `Namn: ${b.name}`,
    b.company && `Företag: ${b.company}`,
    b.website && `Webb: ${b.website}`,
    b.category && `Kategori: ${b.category}`,
    fetched[b.website || ""]?.text && `Webbplats (utdrag):\n${fetched[b.website].text.slice(0, 2500)}`
  ].filter(Boolean).join("\n"))).join("\n\n---\n\n");
  return `Företag A (avsändare):\n${aStr}\n\nFöretag B (mottagare, en eller flera):\n${bs}`;
}

function systemPreamble(goal, region) {
  return [
    "Du är Synergimotorn: ett strikt affärsverktyg på svenska som genererar affärssynergier mellan två parter.",
    "Aldrig lova partners, aldrig skriva 'gratis' eller 'free'. Inga utskick görs – endast förslag till användaren.",
    "Leverera STRIKT JSON enligt schema. Inga markeringar, inga kommentarer, ingen text utanför JSON.",
    goal ? `Affärsmål: ${goal}.` : "",
    region ? `Region/marknad: ${region}.` : "",
    "Krav: 10 förslag initialt, därefter gallring bort generiska förslag som kunde gälla vilken som helst.",
    "Välj de 3–5 bästa med värdeintervall (kr) för respektive part, tydliga antaganden (assumptions), källor (SCB, Skatteverket m.fl. samt leverantörsuppgift).",
    "För varje match: name, oneLine, howItWorks (vem gör vad, vem betalar vem), parties[], domino[], firstSteps[], introMessage (A→B), bniPitch (60 sek).",
    "Assumptions skall vara {id:{label,value,unit?}} och valueModel {party:{minFormula,maxFormula}}, endast + - * / ( )."
  ].filter(Boolean).join(" ");
}

function userInstruction(context) {
  return [
    "Läs materialet nedan om parterna. Generera 10 konkreta synergiidéer (kandidater).",
    "Skatta varje kandidats värde och genomförbarhet. Utför sedan en självkritik: ta bort alla generiska idéer som skulle kunna gälla vilka parter som helst.",
    "Returnera de 3–5 bästa med fullt ifyllda fält. Alla siffror i kr (SEK). Kort och rakt språk.",
    "Format:",
    JSON.stringify({ matches: [{ id: "id", name: "Synergi", oneLine: "rad", howItWorks: "text", parties: [{ name: "A", valueKrRange: [1000, 5000], gets: ["nytta"] }], domino: ["nästa aktör"], firstSteps: ["1","2","3"], introMessage: "A→B", bniPitch: "60 sek", assumptions: { a: { label: "text", value: 1, unit: "st" } }, valueModel: { A: { minFormula: "a*1", maxFormula: "a*3" } } }], sources: ["SCB", "Skatteverket", "Leverantörsuppgift"] }, null, 2)
  ].join("\n");
}

function postFilterGeneric(content) {
  if (!content || !Array.isArray(content.matches)) return content;
  const keep = [];
  for (const m of content.matches) {
    const txt = [m.name, m.oneLine, m.howItWorks].filter(Boolean).join(" ");
    if (!isLikelyGeneric(txt)) keep.push(m);
  }
  return { ...content, matches: keep.slice(0, 5) };
}

export async function runSynergyChain({ env, a, bList, goal, region, costState }) {
  const provider = createProvider(env);
  const fetched = {};
  const urls = [a.website, ...bList.map(b => b.website)].filter(Boolean);
  await Promise.all(urls.map(async (u) => { fetched[u] = await fetchTextWithCap(u, Number(env.SYNERGI_FETCH_CAP_BYTES || 120000)); }));

  const messages = [
    { role: "system", content: systemPreamble(goal, region) },
    { role: "user", content: buildBusinessContext(a, bList, fetched) },
    { role: "user", content: userInstruction() }
  ];

  // Token budgets: keep small
  const maxOut = Number(env.SYNERGI_MAX_OUTPUT_TOKENS || 60);
  const res1 = await provider.chat({ messages, responseJson: true, maxOutputTokens: maxOut });
  let content = res1.content;
  if (!content || content.error) {
    return { ok: false, error: content && content.error || res1.error || "model_error", usage: res1.usage || {} };
  }
  content = postFilterGeneric(content);
  // Validate strict schema
  const verr = SynergyResponse.validate(content);
  if (verr) return { ok: false, error: "schema_" + verr, usage: res1.usage || {}, content };

  // cost
  const priceTable = (env.SYNERGI_PRICE_TABLE_JSON && JSON.parse(env.SYNERGI_PRICE_TABLE_JSON)) || {};
  const estimatedSek = priceForUsage(priceTable, res1.provider, res1.model, res1.usage || {});
  if (costState) {
    costState.usage = res1.usage || {};
    costState.estimatedSek = estimatedSek;
    costState.provider = res1.provider;
    costState.model = res1.model;
  }
  return { ok: true, result: content };
}

