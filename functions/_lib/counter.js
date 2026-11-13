// Durable Object for atomic counters and reservations
// Bind as env.SYNERGI_COUNTER in Cloudflare Pages/Workers.
export class SynergiCounter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async getValue(key) {
    const raw = await this.state.storage.get(key);
    if (!raw) return 0;
    try {
      const { v, exp } = JSON.parse(raw);
      if (exp && Date.now() > exp) {
        await this.state.storage.delete(key);
        return 0;
      }
      return Number(v || 0) || 0;
    } catch {
      return Number(raw) || 0;
    }
  }
  async setValue(key, value, ttlSec) {
    const exp = ttlSec > 0 ? (Date.now() + ttlSec * 1000) : 0;
    const payload = JSON.stringify({ v: Number(value || 0), exp });
    await this.state.storage.put(key, payload);
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const op = url.pathname.split("/").pop();
      const body = await request.json().catch(() => ({}));
      const key = String(body.key || "global");
      const ttl = Number(body.ttl || 0);
      const storageKey = key;
      if (op === "get") {
        const cur = await this.getValue(storageKey);
        return json({ ok: true, current: cur });
      }
      if (op === "inc") {
        const limit = Number(body.limit || Infinity);
        const delta = Number(body.delta || 1);
        const cur = await this.getValue(storageKey);
        if (cur + delta > limit) {
          return json({ ok: false, reason: "limit", count: cur });
        }
        const next = cur + delta;
        await this.setValue(storageKey, next, ttl);
        return json({ ok: true, count: next });
      }
      if (op === "reserve") {
        const amount = Number(body.amount || 0);
        const refuseAt = Number(body.refuseAt || 0);
        const cur = await this.getValue(storageKey);
        const after = cur + amount;
        if (after > refuseAt) {
          return json({ ok: false, current: cur });
        }
        await this.setValue(storageKey, after, ttl);
        return json({ ok: true, current: after });
      }
      if (op === "adjust") {
        const delta = Number(body.delta || 0);
        const cur = await this.getValue(storageKey);
        const after = Math.max(0, cur + delta);
        await this.setValue(storageKey, after, ttl);
        return json({ ok: true, current: after });
      }
      return json({ ok: false, error: "bad_op" }, 400);
    } catch (e) {
      return json({ ok: false, error: String(e && e.message || e) }, 500);
    }
  }
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
}

