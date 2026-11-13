// Cost estimation, monthly cap enforcement, and per-IP rate limiting via KV
export function getIp(request) {
  const h = request.headers;
  const ip = h.get("cf-connecting-ip") || "";
  return ip;
}

export function nowYMD(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function nowYM(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

function hasDurable(env) {
  return env && typeof env.SYNERGI_COUNTER?.idFromName === "function" && typeof env.SYNERGI_COUNTER?.get === "function";
}

async function durableFetch(env, key, op, payload) {
  if (!hasDurable(env)) {
    const e = new Error("durable_object_missing");
    e.code = "do_missing";
    throw e;
  }
  const id = env.SYNERGI_COUNTER.idFromName(key);
  const stub = env.SYNERGI_COUNTER.get(id);
  const req = new Request(`https://do/synergi/${op}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, ...payload })
  });
  const res = await stub.fetch(req);
  if (!res || !res.ok) {
    const err = new Error("durable_object_error");
    err.code = "do_error";
    throw err;
  }
  const j = await res.json();
  return j;
}

export async function incIpRateLimit(env, request) {
  const ip = getIp(request);
  if (!ip) return { ok: false, reason: "ip_missing" };
  const limit = Number(env.SYNERGI_RATE_LIMIT_PER_IP_PER_DAY || 5);
  const day = nowYMD();
  const key = `rlip:${day}:${ip}`;
  try {
    const r = await durableFetch(env, key, "inc", { delta: 1, limit, ttl: 86400 + 3600 });
    if (!r.ok) return { ok: false, ip, count: r.count, limit, reason: r.reason || "rate_limited" };
    return { ok: true, ip, count: r.count, limit };
  } catch (e) {
    return { ok: false, reason: "counter_required" };
  }
}

export async function addMonthlySpend(env, deltaSek) {
  const cap = Number(env.SYNERGI_SPEND_CAP_SEK || 100);
  const ym = nowYM();
  const key = `spend:${ym}`;
  const cur = Number((await env.SYNERGI_KV.get(key)) || "0") || 0;
  const after = cur + Number(deltaSek || 0);
  if (after > cap) {
    return { ok: false, current: cur, triedToAdd: deltaSek, cap };
  }
  await env.SYNERGI_KV.put(key, String(after), { expirationTtl: 60 * 60 * 24 * 40 }); // ~40 days
  return { ok: true, current: after, cap };
}

export async function getMonthlySpend(env) {
  const ym = nowYM();
  const key = `spend:${ym}`;
  if (hasDurable(env)) {
    try {
      const r = await durableFetch(env, key, "get", {});
      const cap = Number(env.SYNERGI_SPEND_CAP_SEK || 100);
      return { current: Number(r.current || 0), cap };
    } catch {}
  }
  const cur = Number((await env.SYNERGI_KV.get(key)) || "0") || 0;
  const cap = Number(env.SYNERGI_SPEND_CAP_SEK || 100);
  return { current: cur, cap };
}

export function sanitizeOriginHost(v) {
  try { return new URL(v).hostname; } catch { return ""; }
}

export function allowOrigin(request) {
  const origin = request.headers.get("origin") || request.headers.get("referer") || "";
  let host = sanitizeOriginHost(origin);
  if (host.endsWith(".")) host = host.slice(0, -1);
  // only allow our domains
  return host === "mediahiveab.com" || host === "www.mediahiveab.com" || host === "mediahiveab.pages.dev";
}

export async function reserveMonthlySpend(env, amountSek) {
  const cap = Number(env.SYNERGI_SPEND_CAP_SEK || 100);
  const refuseAt = env.SYNERGI_SPEND_REFUSE_AT_SEK != null
    ? Number(env.SYNERGI_SPEND_REFUSE_AT_SEK)
    : Math.max(0, Math.floor(cap * Number(env.SYNERGI_SPEND_REFUSE_RATIO || 0.9)));
  const ym = nowYM();
  const key = `spend:${ym}`;
  try {
    const r = await durableFetch(env, key, "reserve", { amount: Number(amountSek || 0), refuseAt, ttl: 60 * 60 * 24 * 40 });
    return { ok: !!r.ok, current: r.current, refuseAt, cap };
  } catch (e) {
    return { ok: false, reason: "counter_required" };
  }
}

export async function adjustMonthlySpend(env, deltaSek) {
  const ym = nowYM();
  const key = `spend:${ym}`;
  try {
    const r = await durableFetch(env, key, "adjust", { delta: Number(deltaSek || 0), ttl: 60 * 60 * 24 * 40 });
    return { ok: !!r.ok, current: r.current };
  } catch (e) {
    return { ok: false, reason: "counter_required" };
  }
}

export async function incrCounter(env, keyBase) {
  const day = nowYMD();
  const key = `cnt:${keyBase}:${day}`;
  try {
    await durableFetch(env, key, "inc", { delta: 1, ttl: 60 * 60 * 24 * 60 });
  } catch (e) {
    // Metrics counter is best-effort; do not fallback; ignore on failure
  }
}

