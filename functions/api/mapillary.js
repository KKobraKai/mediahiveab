// Proxy for the Takmätning tool: nearest Mapillary street photos around a point.
// The Mapillary client token lives in the Pages secret MAPILLARY_TOKEN, never in the page.
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const bbox = (u.searchParams.get("bbox") || "").split(",").map(Number);
  const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (!env.MAPILLARY_TOKEN) return json({ error: "token_missing" }, 503);
  if (bbox.length !== 4 || bbox.some(isNaN)) return json({ error: "bad_bbox" }, 400);
  const [w, s, e, n] = bbox;
  if (e <= w || n <= s || e - w > 0.01 || n - s > 0.01) return json({ error: "bbox_too_large" }, 400);
  const api = "https://graph.mapillary.com/images?fields=id,captured_at,thumb_1024_url,computed_geometry&limit=8&bbox=" +
    [w, s, e, n].map(v => v.toFixed(6)).join(",");
  const r = await fetch(api, { headers: { Authorization: "OAuth " + env.MAPILLARY_TOKEN } });
  if (!r.ok) return json({ error: "upstream_" + r.status }, 502);
  return json(await r.json());
}
