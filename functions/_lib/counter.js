// Durable Object for atomic counters and reservations
// Bind as env.SYNERGI_COUNTER in Cloudflare Pages/Workers.
export class SynergiCounter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const op = url.pathname.split("/").pop();
      const body = await request.json().catch(() => ({}));
      const key = String(body.key || "global");
      const ttl = Number(body.ttl || 0);
      const storageKey = key;
      const now = Date.now();
      const putOpts = ttl > 0 ? { expiration: Math.floor((now + ttl * 1000) / 1000) } : undefined;
      if (op === "get") {
        const cur = Number((await this.state.storage.get(storageKey)) || 0) || 0;
        return json({ ok: true, current: cur });
      }
      if (op === "inc") {
        const limit = Number(body.limit || Infinity);
        const delta = Number(body.delta || 1);
        const cur = Number((await this.state.storage.get(storageKey)) || 0) || 0;
        if (cur + delta > limit) {
          return json({ ok: false, reason: "limit", count: cur });
        }
        const next = cur + delta;
        await this.state.storage.put(storageKey, String(next), putOpts);
        return json({ ok: true, count: next });
      }
      if (op === "reserve") {
        const amount = Number(body.amount || 0);
        const refuseAt = Number(body.refuseAt || 0);
        const cur = Number((await this.state.storage.get(storageKey)) || 0) || 0;
        const after = cur + amount;
        if (after > refuseAt) {
          return json({ ok: false, current: cur });
        }
        await this.state.storage.put(storageKey, String(after), putOpts);
        return json({ ok: true, current: after });
      }
      if (op === "adjust") {
        const delta = Number(body.delta || 0);
        const cur = Number((await this.state.storage.get(storageKey)) || 0) || 0;
        const after = Math.max(0, cur + delta);
        await this.state.storage.put(storageKey, String(after), putOpts);
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

