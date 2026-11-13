import { allowOrigin, incIpRateLimit, addMonthlySpend, getMonthlySpend } from "../_lib/cost.js";
import { runSynergyChain } from "../_lib/chain.js";

function json(o, s = 200, extra = {}) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra }
  });
}

export async function onRequestPost({ request, env }) {
  if (!allowOrigin(request)) return json({ error: "forbidden" }, 403);
  if (!env.SYNERGI_KV) return json({ error: "kv_missing" }, 500);
  const rate = await incIpRateLimit(env, request);
  if (!rate.ok) {
    return json({ error: "rate_limited", message: "För många körningar från din IP idag. Försök igen i morgon.", ip: rate.ip }, 429);
  }
  // Monthly spend gate
  const ms = await getMonthlySpend(env);
  const cap = Number(env.SYNERGI_SPEND_CAP_SEK || 100);
  if (ms.current >= cap) {
    return json({ error: "monthly_cap_reached", message: "Månadens budget för Synergimotorn är slut. Prova nästa månad." }, 402);
  }
  let body = {};
  try { body = await request.json(); } catch {}
  const a = body && body.a || {};
  const bList = (body && body.bList) || [];
  const goal = body && body.goal || "";
  const region = body && body.region || "";
  if (!a || !bList || !Array.isArray(bList) || bList.length === 0) {
    return json({ error: "bad_request", message: "Ange avsändare (du) och minst en mottagare." }, 400);
  }
  const costState = { usage: {}, estimatedSek: 0, provider: "", model: "" };
  const res = await runSynergyChain({ env, a, bList, goal, region, costState });
  if (!res.ok) {
    return json({ error: res.error || "run_failed", details: res.content && res.content.error }, 502);
  }
  // Add spend estimate. If this would exceed cap, refuse.
  const trialAfter = (ms.current || 0) + (costState.estimatedSek || 0);
  if (trialAfter > cap) {
    return json({ error: "monthly_cap_would_exceed", message: "Månadens budget skulle överskridas. Försök igen senare." }, 402);
  }
  const add = await addMonthlySpend(env, costState.estimatedSek || 0);
  if (!add.ok) {
    return json({ error: "monthly_cap_reached", message: "Månadens budget för Synergimotorn är slut. Prova nästa månad." }, 402);
  }
  // Return with meta
  return json({
    ok: true,
    matches: res.result.matches,
    sources: res.result.sources,
    meta: {
      provider: costState.provider,
      model: costState.model,
      usage: costState.usage,
      estimatedSek: Number((costState.estimatedSek || 0).toFixed(3)),
      spendMonth: add.current,
      capSek: add.cap
    }
  });
}

export async function onRequestGet({ request, env }) {
  // Health / budget
  if (!allowOrigin(request)) return json({ error: "forbidden" }, 403);
  const ms = env.SYNERGI_KV ? await getMonthlySpend(env) : { current: 0, cap: Number(env.SYNERGI_SPEND_CAP_SEK || 100) };
  return json({ ok: true, budget: ms });
}

