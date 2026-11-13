// Schema and validation helpers for Synergimotor strict JSON
// Kept dependency-free for small bundles. Simple structural checks only.
// If you later prefer zod/ajv, swap these validators but keep the exported API.
export const SynergyParty = {
  validate(party) {
    if (!party || typeof party !== "object") return "party_not_object";
    if (typeof party.name !== "string" || !party.name.trim()) return "party_name";
    if (!Array.isArray(party.valueKrRange) || party.valueKrRange.length !== 2) return "party_value_range";
    if (party.valueKrRange.some(v => typeof v !== "number" || !isFinite(v))) return "party_value_range_numbers";
    if (!Array.isArray(party.gets) || party.gets.some(x => typeof x !== "string")) return "party_gets";
    return null;
  }
};

export const SynergyItem = {
  validate(item) {
    if (!item || typeof item !== "object") return "item_not_object";
    if (typeof item.id !== "string" || !item.id.trim()) return "id";
    if (typeof item.name !== "string" || !item.name.trim()) return "name";
    if (typeof item.oneLine !== "string" || !item.oneLine.trim()) return "oneLine";
    if (typeof item.howItWorks !== "string" || !item.howItWorks.trim()) return "howItWorks";
    if (!Array.isArray(item.parties) || item.parties.length < 2) return "parties";
    for (const p of item.parties) {
      const e = SynergyParty.validate(p);
      if (e) return "party_" + e;
    }
    if (!Array.isArray(item.domino) || item.domino.some(x => typeof x !== "string")) return "domino";
    if (!Array.isArray(item.firstSteps) || item.firstSteps.length === 0 || item.firstSteps.some(x => typeof x !== "string")) return "firstSteps";
    if (typeof item.introMessage !== "string" || !item.introMessage.trim()) return "introMessage";
    if (typeof item.bniPitch !== "string" || !item.bniPitch.trim()) return "bniPitch";
    if (!item.assumptions || typeof item.assumptions !== "object") return "assumptions";
    if (!item.valueModel || typeof item.valueModel !== "object") return "valueModel";
    // assumptions: { [key]: { label: string, value: number, unit?: string } }
    for (const [k, a] of Object.entries(item.assumptions)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k)) return "assumption_key_" + k;
      if (!a || typeof a !== "object") return "assumption_obj_" + k;
      if (typeof a.label !== "string" || !a.label.trim()) return "assumption_label_" + k;
      if (typeof a.value !== "number" || !isFinite(a.value)) return "assumption_value_" + k;
      if (a.unit != null && typeof a.unit !== "string") return "assumption_unit_" + k;
    }
    // valueModel: { [partyName]: { minFormula: string, maxFormula: string } }
    for (const [party, vm] of Object.entries(item.valueModel)) {
      if (!vm || typeof vm !== "object") return "value_model_obj_" + party;
      if (typeof vm.minFormula !== "string" || typeof vm.maxFormula !== "string") return "value_model_formulas_" + party;
      // very light guard: only allow numbers, +-*\/() and assumption ids
      const ok = /^[0-9+\-*/(). _a-zA-Z]+$/.test(vm.minFormula) && /^[0-9+\-*/(). _a-zA-Z]+$/.test(vm.maxFormula);
      if (!ok) return "value_model_tokens_" + party;
    }
    return null;
  }
};

export const SynergyResponse = {
  validate(payload) {
    if (!payload || typeof payload !== "object") return "root_not_object";
    if (!Array.isArray(payload.matches) || payload.matches.length === 0) return "matches";
    if (payload.matches.length > 5) return "too_many_matches";
    for (const it of payload.matches) {
      const e = SynergyItem.validate(it);
      if (e) return "item_" + e;
    }
    if (!Array.isArray(payload.sources) || payload.sources.some(s => typeof s !== "string")) return "sources";
    return null;
  }
};

export function isLikelyGeneric(ideaText) {
  if (!ideaText || typeof ideaText !== "string") return true;
  const s = ideaText.toLowerCase();
  // Heuristic: flag as generic if only generic business words and no domain hooks
  const genericPhrases = [
    "cross-sell", "upsell", "bundle", "newsletter", "social media",
    "referral", "loyalty program", "discount", "content marketing",
    "seo", "webinar", "lead magnet", "landing page"
  ];
  const domainHooks = ["tak", "hängrän", "fastighet", "sol", "panel", "skylt", "städ", "gutter", "roof", "property", "solar", "tenant", "bostad", "hyres", "värme"];
  const isGeneric = genericPhrases.some(p => s.includes(p));
  const hasHook = domainHooks.some(h => s.includes(h));
  return isGeneric && !hasHook;
}

export function evalValueModel(assumptions, formula) {
  // Very small safe eval: replace tokens with numbers, only allow + - * / ( )
  const dict = Object.fromEntries(Object.entries(assumptions).map(([k, v]) => [k, Number(v && v.value || 0)]));
  let expr = String(formula);
  // Replace assumption ids with numbers with word boundaries
  for (const [k, v] of Object.entries(dict)) {
    const re = new RegExp(`\\b${k}\\b`, "g");
    expr = expr.replace(re, String(v));
  }
  // Strip illegal characters
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) throw new Error("bad_formula");
  // eslint-disable-next-line no-new-func
  const val = Function(`"use strict"; return (${expr});`)();
  if (typeof val !== "number" || !isFinite(val)) throw new Error("nan");
  return val;
}

export function recomputePartyRanges(item) {
  const out = {};
  for (const p of item.parties) out[p.name] = [0, 0];
  for (const [party, fm] of Object.entries(item.valueModel)) {
    try {
      const min = evalValueModel(item.assumptions, fm.minFormula);
      const max = evalValueModel(item.assumptions, fm.maxFormula);
      out[party] = [Math.round(min), Math.round(max)];
    } catch (e) {
      out[party] = [0, 0];
    }
  }
  return out;
}

