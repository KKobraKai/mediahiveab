import { allowOrigin, incIpRateLimit, getMonthlySpend, reserveMonthlySpend, adjustMonthlySpend, incrCounter } from "../_lib/cost.js";
import { runSynergyChain } from "../_lib/chain.js";
import { createProvider, priceForUsage } from "../_lib/provider.js";

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
    if (rate.reason === "ip_missing") return json({ error: "ip_required", message: "Din IP-adress behövs för att köra verktyget." }, 400);
    return json({ error: "rate_limited", message: "För många körningar från din IP idag. Försök igen i morgon." }, 429);
  }
  // Monthly spend gate
  const ms = await getMonthlySpend(env);
  let body = {};
  try { body = await request.json(); } catch {}
  const a = body && body.a || {};
  const bList = (body && body.bList) || [];
  const goal = body && body.goal || "";
  const region = body && body.region || "";
  if (!a || !bList || !Array.isArray(bList) || bList.length === 0) {
    return json({ error: "bad_request", message: "Ange avsändare (du) och minst en mottagare." }, 400);
  }
  // Compute worst-case before calling model
  const provider = createProvider(env);
  const priceTable = (env.SYNERGI_PRICE_TABLE_JSON && JSON.parse(env.SYNERGI_PRICE_TABLE_JSON)) || {};
  const key = `${provider.name}:${provider.model}`;
  const p = priceTable[key] || { inputPer1k: 0.0016, outputPer1k: 0.0064 };
  const calls = 2;
  const maxIn = Number(env.SYNERGI_MAX_INPUT_TOKENS || 3000) * calls;
  const maxOut = Number(env.SYNERGI_MAX_OUTPUT_TOKENS || 3000) * calls;
  const worstSek = (maxIn/1000)*p.inputPer1k + (maxOut/1000)*p.outputPer1k;
  if (worstSek > 0.5) {
    return json({ error: "budget_worst_case_exceeds", message: "Körningen avbryts: värsta fallet skulle överskrida 0,50 kr." }, 402);
  }
  const resv = await reserveMonthlySpend(env, worstSek);
  if (!resv.ok) {
    await incrCounter(env, "overcap");
    return json({ error: "monthly_cap_reached", message: "Månadens budget för Synergimotorn är slut. Prova nästa månad." }, 402);
  }
  const costState = { usage: {}, estimatedSek: 0, provider: "", model: "", worstSek };
  const res = await runSynergyChain({ env, a, bList, goal, region, costState });
  if (!res.ok) {
    await adjustMonthlySpend(env, -worstSek);
    await incrCounter(env, "fail");
    return json({ error: res.error || "run_failed", details: res.content && res.content.error }, 502);
  }
  // Settle reservation to actual
  const delta = (costState.estimatedSek || 0) - worstSek;
  const adj = await adjustMonthlySpend(env, delta);
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
      spendMonth: adj.current,
      capSek: Number(env.SYNERGI_SPEND_CAP_SEK || 100)
    }
  });
}

export async function onRequestGet({ request, env }) {
  // Health / budget
  if (!allowOrigin(request)) return json({ error: "forbidden" }, 403);
  const ms = env.SYNERGI_KV ? await getMonthlySpend(env) : { current: 0, cap: Number(env.SYNERGI_SPEND_CAP_SEK || 100) };
  return json({ ok: true, budget: ms });
}

