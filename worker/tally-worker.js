// Roma 2026 RSVP tally + program suggestions + hotel prices. KV binding: TALLY
const GUESTS = ["Justine", "Moritz", "Georgina", "Nikos", "Paulina", "Giulia", "Nicola", "Luca"];
const ANSWERS = ["yes", "no", "maybe"];
const ORIGIN = "https://luca1997sb.github.io";
const MAX_SUGGESTIONS = 100;

// live weekend prices + photos + sites via SerpApi (Google Hotels), xotelo as price fallback
const CHECKIN = "2026-11-26";
const CHECKOUT = "2026-11-29";
const PRICE_TTL_MS = 72 * 60 * 60 * 1000; // 72h: ~10 refreshes/month x 17 queries fits the 250 free searches
const SERP_QUERIES = {
  "casa-monti":     "Casa Monti Roma",
  "palazzo-talia":  "Palazzo Talia Rome",
  "de-la-ville":    "Hotel de la Ville Rome",
  "hassler":        "Hotel Hassler Roma",
  "de-russie":      "Hotel de Russie Rome",
  "palazzo-ripetta":"Palazzo Ripetta Rome",
  "trame":          "Hotel Trame Rome",
  "locarno":        "Hotel Locarno Rome",
  "nomos":          "Nomos Hotel Rome",
  "santa-maria":    "Hotel Santa Maria Trastevere Rome",
  "santa-chiara":   "Albergo Santa Chiara Rome",
  "donna-camilla":  "Donna Camilla Savelli Rome",
  "g-rough":        "G-Rough Rome",
  "passepartout":   "Passepartout guest house Rome",
  "mario-fiori":    "Mario de Fiori 37 Rome",
  "naman":          "Naman Hotellerie Rome",
  "teatro-pace":    "Hotel Teatro Pace Rome",
};
const XOTELO_KEYS = {
  "casa-monti":     "g187791-d27719211",
  "palazzo-talia":  "g187791-d27413711",
  "de-la-ville":    "g187791-d17399393",
  "hassler":        "g187791-d191332",
  "de-russie":      "g187791-d232851",
  "palazzo-ripetta":"g187791-d239502",
  "locarno":        "g187791-d198734",
  "g-rough":        "g187791-d7395306",
  "mario-fiori":    "g187791-d1235138",
  "donna-camilla":  "g187791-d1024807",
  "passepartout":   "g187791-d25256717",
  "teatro-pace":    "g187791-d504558",
  "santa-maria":    "g187791-d239263",
  "santa-chiara":   "g187791-d236146",
  "naman":          "g187791-d18941041",
  "trame":          "g187791-d34127616",
  "nomos":          "g187791-d33372468",
};

async function fetchSerpHotel(env, id) {
  const url = "https://serpapi.com/search.json?engine=google_hotels" +
    "&q=" + encodeURIComponent(SERP_QUERIES[id]) +
    "&check_in_date=" + CHECKIN + "&check_out_date=" + CHECKOUT +
    "&adults=2&currency=EUR&gl=it&hl=en&api_key=" + env.SERPAPI_KEY;
  const r = await fetch(url);
  if (!r.ok) return null;
  const d = await r.json();
  let prop = null;
  if (d.name && (d.rate_per_night || d.images)) prop = d; // direct property match
  else if (Array.isArray(d.properties) && d.properties.length) prop = d.properties[0];
  if (!prop) return null;
  const price = prop.rate_per_night && prop.rate_per_night.extracted_lowest;
  const photos = (prop.images || [])
    .map(function (im) { return im.original_image || im.thumbnail; })
    .filter(Boolean).slice(0, 8);
  let site = prop.link || null;
  if (site) site = site.split("?")[0];
  return { price: price > 0 ? price : null, photos: photos, site: site };
}

async function fetchXoteloPrice(id) {
  const key = XOTELO_KEYS[id];
  if (!key) return null;
  const url = "https://data.xotelo.com/api/rates?hotel_key=" + key +
    "&chk_in=" + CHECKIN + "&chk_out=" + CHECKOUT + "&adults=2&currency=EUR";
  const r = await fetch(url, { headers: { "User-Agent": "roma2026-party-site" } });
  if (!r.ok) return null;
  const d = await r.json();
  const rates = d && d.result && d.result.rates;
  if (!Array.isArray(rates) || !rates.length) return null;
  const vals = rates.map(function (x) { return x.rate; }).filter(function (v) { return v > 0; });
  return vals.length ? Math.min.apply(null, vals) : null;
}

async function refreshPrices(env) {
  let prev = {};
  try { prev = (JSON.parse(await env.TALLY.get("serpcache")) || {}).hotels || {}; } catch (e) {}
  const hotels = {};
  for (const id of Object.keys(SERP_QUERIES)) {
    let h = null;
    try { h = await fetchSerpHotel(env, id); } catch (e) {}
    if (!h) h = prev[id] || { price: null, photos: [], site: null };
    if (!h.price) {
      try { h.price = await fetchXoteloPrice(id); } catch (e) {}
    }
    if ((!h.photos || !h.photos.length) && prev[id]) h.photos = prev[id].photos || [];
    if (!h.site && prev[id]) h.site = prev[id].site || null;
    hotels[id] = h;
  }
  const doc = { ts: Date.now(), hotels: hotels };
  await env.TALLY.put("serpcache", JSON.stringify(doc));
  return doc;
}

function pricesResponse(doc) {
  const prices = {}, photos = {}, sites = {};
  for (const id of Object.keys(doc.hotels || {})) {
    prices[id] = doc.hotels[id].price || null;
    photos[id] = doc.hotels[id].photos || [];
    sites[id] = doc.hotels[id].site || null;
  }
  return { ts: doc.ts, prices: prices, photos: photos, sites: sites };
}

function json(data, cors, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default {
  async fetch(req, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const path = new URL(req.url).pathname;

    // ---- hotel prices + photos + sites (cached, stale-while-revalidate) ----
    if (path === "/prices" && req.method === "GET") {
      let doc = null;
      try { doc = JSON.parse(await env.TALLY.get("serpcache")); } catch (e) {}
      if (!doc || !doc.hotels) {
        doc = await refreshPrices(env);
      } else if (Date.now() - doc.ts > PRICE_TTL_MS && ctx && ctx.waitUntil) {
        ctx.waitUntil(refreshPrices(env));
      }
      return json(pricesResponse(doc), cors);
    }

    // ---- suggestions ----
    if (path === "/suggestions" && req.method === "GET") {
      const list = await env.TALLY.list({ prefix: "sugg:" });
      const items = [];
      for (const k of list.keys.slice(0, MAX_SUGGESTIONS)) {
        const v = await env.TALLY.get(k.name);
        if (v) { try { items.push(JSON.parse(v)); } catch (e) {} }
      }
      items.sort(function (a, b) { return a.t - b.t; });
      return json(items, cors);
    }

    if (path === "/suggest" && req.method === "POST") {
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, cors, 400); }
      const name = body && body.name;
      let text = body && typeof body.text === "string" ? body.text : "";
      text = text.replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
      if (!GUESTS.includes(name) || text.length < 2 || text.length > 140) {
        return json({ error: "invalid" }, cors, 400);
      }
      const existing = await env.TALLY.list({ prefix: "sugg:" });
      if (existing.keys.length >= MAX_SUGGESTIONS) return json({ error: "full" }, cors, 429);
      const t = Date.now();
      const key = "sugg:" + t + "-" + Math.random().toString(36).slice(2, 8);
      await env.TALLY.put(key, JSON.stringify({ name: name, text: text, t: t }));
      return json({ ok: true }, cors);
    }

    // ---- tally ----
    if (req.method === "GET") {
      const tally = {};
      for (const g of GUESTS) {
        const v = await env.TALLY.get(g);
        if (v && ANSWERS.includes(v)) tally[g] = v;
      }
      tally["Luca"] = "yes";
      tally["Justine"] = "yes";
      return json(tally, cors);
    }

    if (req.method === "POST") {
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: "bad json" }, cors, 400); }
      const name = body && body.name;
      const answer = body && body.answer;
      if (!GUESTS.includes(name) || !ANSWERS.includes(answer)) {
        return json({ error: "invalid" }, cors, 400);
      }
      await env.TALLY.put(name, answer);
      return json({ ok: true }, cors);
    }

    return new Response("not found", { status: 404, headers: cors });
  },
};
