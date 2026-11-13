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

export async function incIpRateLimit(env, request) {
  const ip = getIp(request);
  if (!ip) return { ok: false, reason: "ip_missing" };
  const limit = Number(env.SYNERGI_RATE_LIMIT_PER_IP_PER_DAY || 5);
  const day = nowYMD();
  const key = `rlip:${day}:${ip}`;
  const n = await env.SYNERGI_KV.get(key);
  const cur = Number(n || "0") || 0;
  if (cur >= limit) {
    return { ok: false, ip, count: cur, limit };
  }
  await env.SYNERGI_KV.put(key, String(cur + 1), { expirationTtl: 86400 + 3600 }); // ~1 day
  return { ok: true, ip, count: cur + 1, limit };
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
  const cur = Number((await env.SYNERGI_KV.get(key)) || "0") || 0;
  const cap = Number(env.SYNERGI_SPEND_CAP_SEK || 100);
  return { current: cur, cap };
}

export function sanitizeOriginHost(v) {
  try { return new URL(v).hostname; } catch { return ""; }
}

export function allowOrigin(request) {
  const origin = request.headers.get("origin") || request.headers.get("referer") || "";
  const host = sanitizeOriginHost(origin);
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
  const cur = Number((await env.SYNERGI_KV.get(key)) || "0") || 0;
  const after = cur + Number(amountSek || 0);
  if (after > refuseAt) return { ok: false, current: cur, refuseAt, cap };
  await env.SYNERGI_KV.put(key, String(after), { expirationTtl: 60 * 60 * 24 * 40 });
  return { ok: true, current: after, refuseAt, cap };
}

export async function adjustMonthlySpend(env, deltaSek) {
  const ym = nowYM();
  const key = `spend:${ym}`;
  const cur = Number((await env.SYNERGI_KV.get(key)) || "0") || 0;
  const after = cur + Number(deltaSek || 0);
  await env.SYNERGI_KV.put(key, String(Math.max(0, after)), { expirationTtl: 60 * 60 * 24 * 40 });
  return { ok: true, current: after };
}

export async function incrCounter(env, keyBase) {
  const day = nowYMD();
  const key = `cnt:${keyBase}:${day}`;
  const cur = Number((await env.SYNERGI_KV.get(key)) || "0") || 0;
  await env.SYNERGI_KV.put(key, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 60 });
}

