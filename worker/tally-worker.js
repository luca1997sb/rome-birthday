// Roma 2026 RSVP tally + program suggestions. KV binding: TALLY
const GUESTS = ["Justine", "Moritz", "Georgina", "Nikos", "Paulina", "Giulia", "Nicola", "Luca"];
const ANSWERS = ["yes", "no", "maybe"];
const ORIGIN = "https://luca1997sb.github.io";
const MAX_SUGGESTIONS = 100;

function json(data, cors, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const path = new URL(req.url).pathname;

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
