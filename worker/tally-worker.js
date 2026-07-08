// Roma 2026 RSVP tally + program suggestions + hotel prices. KV binding: TALLY
const GUESTS = ["Justine", "Moritz", "Georgina", "Nikos", "Paulina", "Giulia", "Nicola", "Luca"];
const ANSWERS = ["yes", "no", "maybe"];
const ORIGIN = "https://luca1997sb.github.io";
const MAX_SUGGESTIONS = 100;

// live weekend prices via xotelo.com (free TripAdvisor rates API)
const CHECKIN = "2026-11-26";
const CHECKOUT = "2026-11-29";
const PRICE_TTL_MS = 6 * 60 * 60 * 1000; // refresh every 6h
// TripAdvisor hotel keys
const HOTELS = {
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
};

async function fetchHotelPrice(key) {
  const url = "https://data.xotelo.com/api/rates?hotel_key=" + key +
    "&chk_in=" + CHECKIN + "&chk_out=" + CHECKOUT + "&adults=2&currency=EUR";
  const r = await fetch(url, { headers: { "User-Agent": "roma2026-party-site" } });
  if (!r.ok) return null;
  const d = await r.json();
  const rates = d && d.result && d.result.rates;
  if (!Array.isArray(rates) || !rates.length) return null;
  const vals = rates.map(function (x) { return x.rate; }).filter(function (v) { return v > 0; });
  if (!vals.length) return null;
  return Math.min.apply(null, vals);
}

async function refreshPrices(env) {
  const out = {};
  for (const id of Object.keys(HOTELS)) {
    try { out[id] = await fetchHotelPrice(HOTELS[id]); } catch (e) { out[id] = null; }
  }
  const doc = { ts: Date.now(), prices: out };
  await env.TALLY.put("pricecache", JSON.stringify(doc));
  return doc;
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

    // ---- hotel prices (cached, stale-while-revalidate) ----
    if (path === "/prices" && req.method === "GET") {
      let doc = null;
      try { doc = JSON.parse(await env.TALLY.get("pricecache")); } catch (e) {}
      if (!doc) {
        doc = await refreshPrices(env);
      } else if (Date.now() - doc.ts > PRICE_TTL_MS && ctx && ctx.waitUntil) {
        ctx.waitUntil(refreshPrices(env));
      }
      return json(doc, cors);
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
