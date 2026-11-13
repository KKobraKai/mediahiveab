// Re-export the shared Durable Object implementation used by tests and deployment
export { SynergiCounter } from "../../../functions/_lib/counter.js";

// Minimal Module Worker default export to satisfy Wrangler/module entrypoint
export default {
  async fetch(_request) {
    return new Response("ok", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
};

