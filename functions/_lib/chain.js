import { createProvider, priceForUsage } from "./provider.js";
import { SynergyResponse, isLikelyGeneric } from "./schema.js";

export async function fetchTextWithCap(url, capBytes = 120_000, timeoutMs = 6000) {
  const seen = new Set();
  async function single(u, hops) {
    if (hops > 3) return { text: "", bytes: 0, error: "too_many_redirects" };
    const safe = safeUrl(u);
    if (!safe.ok) return { text: "", bytes: 0, error: safe.error || "bad_url" };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(u, { headers: { "accept": "text/html, text/plain" }, signal: ctrl.signal, redirect: "manual" });
      const loc = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && loc) {
        const next = new URL(loc, u).toString();
        if (seen.has(next)) return { text: "", bytes: 0, error: "redirect_loop" };
        seen.add(next);
        return await single(next, hops + 1);
      }
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("text/html") && !ct.includes("text/plain")) return { text: "", bytes: 0, contentType: ct };
      let bytes = 0;
      let text = "";
      if (r.body && typeof r.body.getReader === "function") {
        const reader = r.body.getReader();
        const dec = new TextDecoder("utf-8");
        let done, value;
        while (({ done, value } = await reader.read()), !done) {
          bytes += value.byteLength;
          if (bytes > capBytes) {
            text += dec.decode(value.subarray(0, capBytes - (bytes - value.byteLength)));
            break;
          }
          text += dec.decode(value, { stream: true });
        }
      } else {
        const ab = await r.arrayBuffer();
        const buf = ab.byteLength > capBytes ? ab.slice(0, capBytes) : ab;
        bytes = buf.byteLength;
        text = new TextDecoder("utf-8").decode(buf);
      }
      return { text, bytes, contentType: ct };
    } catch (e) {
      return { text: "", bytes: 0, error: String(e && e.message || e) };
    } finally {
      clearTimeout(t);
    }
  }
  return await single(url, 0);
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

function capList(list, max) { return Array.isArray(list) ? list.slice(0, Math.max(0, max|0)) : []; }

function safeUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "bad_scheme" };
    const host = url.hostname.toLowerCase();
    // Block localhost / loopback
    if (host === "localhost") return { ok: false, error: "localhost" };
    // IPv6 literal
    if (host.startsWith("[") && host.endsWith("]")) {
      const h = host.slice(1, -1);
      if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return { ok: false, error: "ip6_private" };
    }
    // IPv4 literal
    const m = host.match(/^(\d{1,3}\.){3}\d{1,3}$/);
    if (m) {
      const parts = host.split(".").map(Number);
      const [a, b] = parts;
      const ip4 = (a<<24) + (b<<16) + (parts[2]<<8) + parts[3];
      // Private, loopback, link-local, CGNAT, test, multicast, meta
      const inRange = (a, b, c, d, mask) => {
        const base = (a<<24) + (b<<16) + (c<<8) + d;
        return (ip4 & mask) === (base & mask);
      };
      if (inRange(127,0,0,0, 0xff000000)) return { ok: false, error: "loopback" };
      if (inRange(10,0,0,0, 0xff000000)) return { ok: false, error: "private" };
      if (inRange(192,168,0,0, 0xffff0000)) return { ok: false, error: "private" };
      if (inRange(172,16,0,0, 0xfff00000)) return { ok: false, error: "private" };
      if (inRange(100,64,0,0, 0xffc00000)) return { ok: false, error: "cgnat" };
      if (inRange(169,254,0,0, 0xffff0000)) return { ok: false, error: "linklocal" };
      if (host === "169.254.169.254") return { ok: false, error: "metadata" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "bad_url" };
  }
}

function estimateTokensFromChars(chars) {
  return Math.ceil(chars / 4); // conservative
}

export async function runSynergyChain({ env, a, bList, goal, region, costState }) {
  const provider = createProvider(env);
  // Caps
  const maxB = Number(env.SYNERGI_MAX_B_COUNT || 5);
  bList = capList(bList, maxB);
  const fetched = {};
  const urls = [a.website, ...bList.map(b => b.website)].filter(Boolean);
  await Promise.all(urls.map(async (u) => { fetched[u] = await fetchTextWithCap(u, Number(env.SYNERGI_FETCH_CAP_BYTES || 120000)); }));

  const messages = [
    { role: "system", content: systemPreamble(goal, region) },
    { role: "user", content: buildBusinessContext(a, bList, fetched) },
    { role: "user", content: userInstruction() }
  ];

  // Token budgets: generous but affordable on mini-class
  const maxOut = Number(env.SYNERGI_MAX_OUTPUT_TOKENS || 3000);
  const maxPromptChars = Number(env.SYNERGI_MAX_PROMPT_CHARS || 16000);
  const promptChars = Math.min(messages.map(m => m.content.length).reduce((a,b)=>a+b,0), maxPromptChars);
  const estIn1 = estimateTokensFromChars(promptChars);
  const res1 = await provider.chat({ messages, responseJson: true, maxOutputTokens: maxOut });
  let content1 = res1.content;
  if (!content1 || content1.error) {
    return { ok: false, error: content1 && content1.error || res1.error || "model_error", usage: res1.usage || {} };
  }
  // Second pass: critique & selection
  const critMsg = [
    { role: "system", content: "SJÄLVKRITIK: Ta bort generiska förslag som kunde gälla vilka parter som helst. Returnera topp 3–5 bäst rankade. STRIKT JSON med samma schema." },
    { role: "user", content: "Kandidater (10 st):\n" + JSON.stringify(content1) }
  ];
  const res2 = await provider.chat({ messages: critMsg, responseJson: true, maxOutputTokens: maxOut });
  let content = res2.content;
  if (!content || content.error) {
    return { ok: false, error: content && content.error || res2.error || "model_error", usage: { promptTokens: (res1.usage?.promptTokens||0), completionTokens: (res1.usage?.completionTokens||0) } };
  }
  content = postFilterGeneric(content);
  const verr = SynergyResponse.validate(content);
  if (verr) return { ok: false, error: "schema_" + verr, usage: { promptTokens: (res1.usage?.promptTokens||0)+(res2.usage?.promptTokens||0), completionTokens: (res1.usage?.completionTokens||0)+(res2.usage?.completionTokens||0) }, content };

  // cost
  const priceTable = (env.SYNERGI_PRICE_TABLE_JSON && JSON.parse(env.SYNERGI_PRICE_TABLE_JSON)) || {};
  const usageSum = {
    promptTokens: (res1.usage?.promptTokens || 0) + (res2.usage?.promptTokens || 0),
    completionTokens: (res1.usage?.completionTokens || 0) + (res2.usage?.completionTokens || 0)
  };
  const estimatedSek = priceForUsage(priceTable, res1.provider, res1.model, usageSum);
  if (costState) {
    costState.usage = usageSum;
    costState.estimatedSek = estimatedSek;
    costState.provider = res1.provider;
    costState.model = res1.model;
    // worst-case assertion
    const p = priceTable[`${res1.provider}:${res1.model}`] || { inputPer1k: 0.0016, outputPer1k: 0.0064 };
    const maxInTokens = Number(env.SYNERGI_MAX_INPUT_TOKENS || 3000) * 2; // two calls
    const maxOutTokens = Number(env.SYNERGI_MAX_OUTPUT_TOKENS || 3000) * 2;
    const worstSek = (maxInTokens/1000)*p.inputPer1k + (maxOutTokens/1000)*p.outputPer1k;
    costState.worstSek = worstSek;
    if (worstSek > 0.5) {
      return { ok: false, error: "budget_worst_case_exceeds", usage: usageSum, content, worstSek };
    }
  }
  return { ok: true, result: content };
}

