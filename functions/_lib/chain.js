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
            const already = bytes - value.byteLength;
            const remaining = Math.max(0, capBytes - already);
            if (remaining > 0) text += dec.decode(value.subarray(0, remaining));
            bytes = capBytes;
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

function trunc(s, n) {
  if (s == null) return s;
  const str = String(s);
  if (!Number.isFinite(n) || n <= 0) return str;
  return str.length > n ? str.slice(0, n) : str;
}

function capMessagesChars(messages, maxChars) {
  if (!Array.isArray(messages)) return [];
  const out = messages.map(m => ({ ...m }));
  const total = () => out.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0);
  let cur = total();
  if (!Number.isFinite(maxChars) || maxChars <= 0) return out;
  // Trim from the last message backwards until under cap
  for (let i = out.length - 1; i >= 0 && cur > maxChars; i--) {
    const m = out[i];
    const over = cur - maxChars;
    const c = m.content || "";
    if (c.length <= 0) continue;
    const reduceBy = Math.min(over, Math.max(0, c.length - 1));
    out[i] = { ...m, content: c.slice(0, c.length - reduceBy) };
    cur = total();
  }
  return out;
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
    let host = url.hostname.toLowerCase();
    // Normalize trailing dot (e.g. localhost.)
    if (host.endsWith(".")) host = host.slice(0, -1);
    // Block localhost / loopback and *.localhost
    if (host === "localhost" || host.endsWith(".localhost")) return { ok: false, error: "localhost" };
    // IPv6 literal
    if (host.startsWith("[") && host.endsWith("]")) {
      const h = host.slice(1, -1);
      const hl = h.toLowerCase();
      // Unspecified, loopback, ULA, link-local, site-local, multicast, IPv4-mapped
      if (hl === "::" || hl === "::1") return { ok: false, error: "ip6_loopback" };
      if (hl.startsWith("fc") || hl.startsWith("fd")) return { ok: false, error: "ip6_ula" };
      if (hl.startsWith("fe80")) return { ok: false, error: "ip6_linklocal" };
      if (/^fe[cdef]/.test(hl)) return { ok: false, error: "ip6_sitelocal" }; // fec0::/10 (deprecated)
      if (hl.startsWith("ff")) return { ok: false, error: "ip6_multicast" }; // ff00::/8
      // NAT64 well-known prefix 64:ff9b::/96 (block outright to avoid mapped private v4)
      if (hl.startsWith("64:ff9b::") || hl.startsWith("64:ff9b:")) return { ok: false, error: "nat64" };
      // IPv4-embedded in IPv6
      const mapPrefix = "::ffff:";
      if (hl.startsWith(mapPrefix) || /^::[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(hl)) {
        // IPv4-mapped (dotted or hex) OR IPv4-compatible hex (::hhhh:hhhh)
        const tail = hl.startsWith(mapPrefix) ? hl.slice(mapPrefix.length) : hl.slice("::".length);
        let a,b,c,d;
        const dotted = tail.match(/^(\d{1,3}\.){3}\d{1,3}$/);
        if (dotted) {
          [a,b,c,d] = tail.split(".").map(Number);
        } else {
          // hex form ::ffff:hhhh:hhhh
          const hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
          if (!hex) return { ok: false, error: "mapped_ip4_bad" };
          const hi = parseInt(hex[1], 16);
          const lo = parseInt(hex[2], 16);
          const ip4 = ((hi & 0xffff) << 16) | (lo & 0xffff);
          a = (ip4 >>> 24) & 0xff;
          b = (ip4 >>> 16) & 0xff;
          c = (ip4 >>> 8) & 0xff;
          d = ip4 & 0xff;
        }
        const ip4 = (a<<24) + (b<<16) + (c<<8) + d;
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
        if (inRange(224,0,0,0, 0xf0000000)) return { ok: false, error: "multicast" }; // 224/4
        if (inRange(0,0,0,0, 0xff000000)) return { ok: false, error: "thisnet" }; // 0.0.0.0/8
        if (inRange(198,18,0,0, 0xfffe0000)) return { ok: false, error: "benchmark" }; // 198.18/15
        if (a===169 && b===254 && c===169 && d===254) return { ok: false, error: "metadata" };
      }
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
      if (inRange(0,0,0,0, 0xff000000)) return { ok: false, error: "thisnet" }; // 0.0.0.0/8
      if (inRange(224,0,0,0, 0xf0000000)) return { ok: false, error: "multicast" }; // 224/4
      if (inRange(198,18,0,0, 0xfffe0000)) return { ok: false, error: "benchmark" }; // 198.18/15
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
  const fieldCap = Number(env.SYNERGI_FIELD_CAP_CHARS || 200);
  // Truncate A and B basic fields eagerly to hard cap upstream payload
  const truncA = {
    name: trunc(a?.name, fieldCap),
    company: trunc(a?.company, fieldCap),
    website: trunc(a?.website, fieldCap),
    category: trunc(a?.category, fieldCap)
  };
  bList = capList(Array.isArray(bList) ? bList.map(b => ({
    name: trunc(b?.name, fieldCap),
    company: trunc(b?.company, fieldCap),
    website: trunc(b?.website, fieldCap),
    category: trunc(b?.category, fieldCap)
  })) : [], maxB);
  const fetched = {};
  const urls = [truncA.website, ...bList.map(b => b.website)].filter(Boolean);
  await Promise.all(urls.map(async (u) => { fetched[u] = await fetchTextWithCap(u, Number(env.SYNERGI_FETCH_CAP_BYTES || 120000)); }));

  const sysMsg = { role: "system", content: systemPreamble(trunc(goal, fieldCap), trunc(region, fieldCap)) };
  const ctxRaw = buildBusinessContext(truncA, bList, fetched);
  const instrMsg = { role: "user", content: userInstruction() };

  // Token budgets: generous but affordable on mini-class
  const maxOut = Number(env.SYNERGI_MAX_OUTPUT_TOKENS || 3000);
  const maxPromptChars = Number(env.SYNERGI_MAX_PROMPT_CHARS || 16000);
  // Preserve system + instruction intact; trim only context to fit under cap
  const fixedLen = sysMsg.content.length + instrMsg.content.length;
  const ctxCap = Math.max(0, maxPromptChars - fixedLen);
  const ctxMsg = { role: "user", content: ctxRaw.length > ctxCap ? ctxRaw.slice(0, ctxCap) : ctxRaw };
  const messages = [sysMsg, ctxMsg, instrMsg];
  const promptChars = messages.map(m => m.content.length).reduce((a,b)=>a+b,0);
  if (costState) {
    costState.promptChars = promptChars;
    costState.maxPromptChars = maxPromptChars;
  }
  const estIn1 = estimateTokensFromChars(promptChars);
  const res1 = await provider.chat({ messages, responseJson: true, maxOutputTokens: maxOut });
  let content1 = res1.content;
  if (!content1 || content1.error) {
    // record partial usage for settlement
    if (costState) {
      const priceTable = (env.SYNERGI_PRICE_TABLE_JSON && JSON.parse(env.SYNERGI_PRICE_TABLE_JSON)) || {};
      costState.provider = res1.provider;
      costState.model = res1.model;
      costState.usage = { promptTokens: res1.usage?.promptTokens || 0, completionTokens: res1.usage?.completionTokens || 0 };
      costState.estimatedSek = priceForUsage(priceTable, res1.provider, res1.model, costState.usage);
    }
    return { ok: false, error: content1 && content1.error || res1.error || "model_error", usage: res1.usage || {} };
  }
  // Second pass: critique & selection
  const critMsg = [
    { role: "system", content: "SJÄLVKRITIK: Ta bort generiska förslag som kunde gälla vilka parter som helst. Returnera topp 3–5 bäst rankade. STRIKT JSON med samma schema." },
    { role: "user", content: "Kandidater (10 st):\n" + JSON.stringify(content1) }
  ];
  let res2;
  try {
    res2 = await provider.chat({ messages: critMsg, responseJson: true, maxOutputTokens: maxOut });
  } catch (e) {
    // If the second call throws, settle using the first call's observed usage
    if (costState) {
      const priceTable = (env.SYNERGI_PRICE_TABLE_JSON && JSON.parse(env.SYNERGI_PRICE_TABLE_JSON)) || {};
      costState.provider = res1.provider;
      costState.model = res1.model;
      costState.usage = { promptTokens: res1.usage?.promptTokens || 0, completionTokens: res1.usage?.completionTokens || 0 };
      costState.estimatedSek = priceForUsage(priceTable, res1.provider, res1.model, costState.usage);
    }
    return { ok: false, error: "model_exception", details: String(e && e.message || e), usage: res1.usage || {} };
  }
  let content = res2.content;
  if (!content || content.error) {
    if (costState) {
      const priceTable = (env.SYNERGI_PRICE_TABLE_JSON && JSON.parse(env.SYNERGI_PRICE_TABLE_JSON)) || {};
      costState.provider = res1.provider;
      costState.model = res1.model;
      costState.usage = {
        promptTokens: (res1.usage?.promptTokens||0) + (res2.usage?.promptTokens||0),
        completionTokens: (res1.usage?.completionTokens||0) + (res2.usage?.completionTokens||0)
      };
      costState.estimatedSek = priceForUsage(priceTable, res1.provider, res1.model, costState.usage);
    }
    return { ok: false, error: content && content.error || res2.error || "model_error", usage: { promptTokens: (res1.usage?.promptTokens||0), completionTokens: (res1.usage?.completionTokens||0) } };
  }
  content = postFilterGeneric(content);
  const verr = SynergyResponse.validate(content);
  if (verr) {
    if (costState) {
      const priceTable = (env.SYNERGI_PRICE_TABLE_JSON && JSON.parse(env.SYNERGI_PRICE_TABLE_JSON)) || {};
      const usage = {
        promptTokens: (res1.usage?.promptTokens||0)+(res2.usage?.promptTokens||0),
        completionTokens: (res1.usage?.completionTokens||0)+(res2.usage?.completionTokens||0)
      };
      costState.provider = res1.provider;
      costState.model = res1.model;
      costState.usage = usage;
      costState.estimatedSek = priceForUsage(priceTable, res1.provider, res1.model, usage);
    }
    return { ok: false, error: "schema_" + verr, usage: { promptTokens: (res1.usage?.promptTokens||0)+(res2.usage?.promptTokens||0), completionTokens: (res1.usage?.completionTokens||0)+(res2.usage?.completionTokens||0) }, content };
  }

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
    // record worst-case at time of run for settlement math (computed in handler gate too)
    const p = priceTable[`${res1.provider}:${res1.model}`];
    if (p) {
      const maxInTokens = Math.min(
        Number(env.SYNERGI_MAX_INPUT_TOKENS || 3000),
        Math.ceil(Number(env.SYNERGI_MAX_PROMPT_CHARS || 16000) / 4)
      ) * 2;
      const maxOutTokens = Number(env.SYNERGI_MAX_OUTPUT_TOKENS || 3000) * 2;
      const worstSek = (maxInTokens/1000)*p.inputPer1k + (maxOutTokens/1000)*p.outputPer1k;
      costState.worstSek = worstSek;
    }
  }
  return { ok: true, result: content };
}

