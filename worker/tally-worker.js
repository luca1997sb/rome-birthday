// Roma 2026 RSVP tally + program suggestions + hotel prices. KV binding: TALLY
const GUESTS = ["Justine", "Moritz", "Georgina", "Nikos", "Paulina", "Giulia", "Nicola", "Luca"];
const ANSWERS = ["yes", "no", "maybe"];
const ORIGIN = "https://luca1997sb.github.io";
const MAX_SUGGESTIONS = 100;

// live weekend prices + photos + sites via SerpApi (Google Hotels).
// Prices are restricted to trusted sellers: Booking.com, Expedia, Hotels.com, or the
// hotel's official site. That per-seller breakdown only comes from the property-details
// endpoint, so each hotel is fetched by its stable property_token (one search/hotel/refresh).
const CHECKIN = "2026-11-26";
const CHECKOUT = "2026-11-29";
const PRICE_TTL_MS = 72 * 60 * 60 * 1000; // 72h: ~10 refreshes/month x 18 queries fits the 250 free searches
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
  "passepartout":   "Passepartout Via del Governo Vecchio 118 Roma",
  "mario-fiori":    "Mario de Fiori 37 Rome",
  "naman":          "Naman Hotellerie Rome",
  "teatro-pace":    "Hotel Teatro Pace Rome",
  "aldrovandi":     "Aldrovandi Residence City Suites Rome",
};
// Google property tokens, discovered 2026-07-08 and verified against each hotel's address.
// Used directly; the SERP_QUERIES search only runs again if a token ever goes stale.
const PROPERTY_TOKENS = {
  "casa-monti":     "ChkIteie566HsasSGg0vZy8xMXZiamIxOWRwEAE",
  "palazzo-talia":  "ChkI75Xcpc3-rYAtGg0vZy8xMWxkOHhxYnlqEAE",
  "de-la-ville":    "ChoIwuWG__7WyMPHARoNL2cvMTFmZ2hwbjVmOBAB",
  "hassler":        "ChkI5cbRtOSptqqKARoML2cvMTFyOTNweW52EAE",
  "de-russie":      "ChgI3tK41OfV-8LqARoLL2cvMXc2d3JfejkQAQ",
  "palazzo-ripetta":"ChoIhK7F4KqX66qBARoNL2cvMTF0MTd2Z2Q1dhAB",
  "trame":          "ChgIo6Gx-az1zWUaDS9nLzExeHZ6Ml8wN3oQAQ",
  "locarno":        "ChcIsfiF7P-C2vcUGgsvZy8xdGY1Z3dzdhAB",
  "nomos":          "ChoIocSE8eDFwImHARoNL2cvMTF5NjRnOWMybRAB",
  "santa-maria":    "ChgIoeSxhZq3-8isARoLL2cvMXRkMjJjeHgQAQ",
  "santa-chiara":   "ChkImIv1q_69utzsARoML2cvMWhjNGYxY3IxEAE",
  "donna-camilla":  "ChgInOOk9fDFvJLfARoLL2cvMXRkaGhzOHMQAQ",
  "g-rough":        "ChkIiODg78L37911Gg0vZy8xMWI3YzFfNHBiEAE",
  "passepartout":   "ChoI65b9yL30vNrlARoNL2cvMTFzNDVjbGtsYxAB",
  "mario-fiori":    "ChcIoZK47OvGiqkFGgsvZy8xdGQ4ZjBjbRAB",
  "naman":          "ChkIzP60hfODq7l1Gg0vZy8xMWZtemdyMW5fEAE",
  "teatro-pace":    "ChgIndn4-YCYz7WbARoLL2cvMXRna3F4c2QQAQ",
  "aldrovandi":     "ChcIz9OxtbyhrrBCGgsvZy8xdGZ5NHoychAB",
};

// exact seller names only: "BusinessHotels.com" and friends must NOT slip through substring matches
function allowedSource(entry) {
  if (entry.official === true) return true;
  const s = (entry.source || "").trim().toLowerCase();
  return s === "booking.com" || s === "hotels.com" || s === "expedia.com" || s === "expedia";
}

function buildHotel(d, token) {
  const entries = (d.featured_prices || []).concat(d.prices || []);
  let price = null, src = null;
  for (const e of entries) {
    if (!allowedSource(e)) continue;
    const v = e.rate_per_night && e.rate_per_night.extracted_lowest;
    if (v > 0 && (price === null || v < price)) { price = v; src = e.source; }
  }
  const photos = (d.images || [])
    .map(function (im) { return im.original_image || im.thumbnail; })
    .filter(Boolean).slice(0, 12);
  let site = d.link || null;
  if (site) site = site.split("?")[0];
  return { price: price, src: src, photos: photos, site: site, token: token || d.property_token || null };
}

async function serpFetch(env, extra) {
  const url = "https://serpapi.com/search.json?engine=google_hotels" + extra +
    "&check_in_date=" + CHECKIN + "&check_out_date=" + CHECKOUT +
    "&adults=2&currency=CHF&gl=ch&hl=en&api_key=" + env.SERPAPI_KEY;
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

async function fetchSerpHotel(env, id, prevToken) {
  const q = "&q=" + encodeURIComponent(SERP_QUERIES[id]);
  let token = prevToken || PROPERTY_TOKENS[id] || null;
  let d = token ? await serpFetch(env, q + "&property_token=" + encodeURIComponent(token)) : null;
  if (!d || !d.name) {
    // token stale or missing: rediscover via search, then retry details
    const s = await serpFetch(env, q);
    if (s && s.name && s.property_token) token = s.property_token;
    else if (s && Array.isArray(s.properties) && s.properties.length) token = s.properties[0].property_token;
    else return null;
    d = await serpFetch(env, q + "&property_token=" + encodeURIComponent(token));
    if (!d || !d.name) return null;
  }
  return buildHotel(d, token);
}

async function refreshPrices(env) {
  let prev = {};
  try { prev = (JSON.parse(await env.TALLY.get("serpcache")) || {}).hotels || {}; } catch (e) {}
  const hotels = {};
  for (const id of Object.keys(SERP_QUERIES)) {
    let h = null;
    try { h = await fetchSerpHotel(env, id, prev[id] && prev[id].token); } catch (e) {}
    if (!h) h = prev[id] || { price: null, src: null, photos: [], site: null, token: null };
    if ((!h.photos || !h.photos.length) && prev[id]) h.photos = prev[id].photos || [];
    if (!h.site && prev[id]) h.site = prev[id].site || null;
    hotels[id] = h;
  }
  const doc = { ts: Date.now(), hotels: hotels };
  await env.TALLY.put("serpcache", JSON.stringify(doc));
  return doc;
}

function pricesResponse(doc) {
  const prices = {}, photos = {}, sites = {}, srcs = {};
  for (const id of Object.keys(doc.hotels || {})) {
    prices[id] = doc.hotels[id].price || null;
    photos[id] = doc.hotels[id].photos || [];
    sites[id] = doc.hotels[id].site || null;
    srcs[id] = doc.hotels[id].src || null;
  }
  return { ts: doc.ts, prices: prices, photos: photos, sites: sites, srcs: srcs };
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
