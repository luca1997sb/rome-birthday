// Roma 2026 RSVP tally relay. KV binding: TALLY
const GUESTS = ["Justine", "Moritz", "Georgina", "Nikos", "Paulina", "Giulia", "Nicola", "Luca"];
const ANSWERS = ["yes", "no", "maybe"];
const ORIGIN = "https://luca1997sb.github.io";

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    if (req.method === "GET") {
      const tally = {};
      for (const g of GUESTS) {
        const v = await env.TALLY.get(g);
        if (v && ANSWERS.includes(v)) tally[g] = v;
      }
      tally["Luca"] = "yes";
      tally["Justine"] = "yes";
      return new Response(JSON.stringify(tally), {
        headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    if (req.method === "POST") {
      let body;
      try { body = await req.json(); } catch (e) {
        return new Response('{"error":"bad json"}', { status: 400, headers: cors });
      }
      const name = body && body.name;
      const answer = body && body.answer;
      if (!GUESTS.includes(name) || !ANSWERS.includes(answer)) {
        return new Response('{"error":"invalid"}', { status: 400, headers: cors });
      }
      await env.TALLY.put(name, answer);
      return new Response('{"ok":true}', {
        headers: { ...cors, "content-type": "application/json" },
      });
    }

    return new Response("not found", { status: 404, headers: cors });
  },
};
