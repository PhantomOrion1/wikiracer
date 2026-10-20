// Cloudflare Worker: hands out short-lived Cloudflare TURN relay logins to the game.
// The TURN API token is a secret, so it lives in the Worker's settings, never in the website code.
//
// Setup (Cloudflare dashboard):
//   1. Realtime → TURN → create a key. Note its "Key ID" and "API token".
//   2. Workers & Pages → Create → Worker → paste this file → Deploy.
//   3. Worker → Settings → Variables and Secrets → add:
//        TURN_KEY_ID        (type: Text)    = the Key ID
//        TURN_KEY_API_TOKEN (type: Secret)  = the API token
//   4. The Worker's URL (https://<name>.<account>.workers.dev) goes in config.json → turn.credentialsUrl.
const ALLOWED = ['https://wikiracer.live', 'https://www.wikiracer.live', 'http://localhost:8765', 'http://localhost:8799'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const ok = ALLOWED.includes(origin) || /^https:\/\/[\w-]+\.wikiracer\.pages\.dev$/.test(origin) || origin === 'https://wikiracer.pages.dev';
    const cors = { 'Access-Control-Allow-Origin': ok ? origin : ALLOWED[0], Vary: 'Origin', 'Cache-Control': 'no-store' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (!ok) return new Response('Forbidden', { status: 403, headers: cors });

    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 }), // valid for 24h, plenty for a play session
    });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (!r.ok) return json({ iceServers: [], error: `turn api ${r.status}` }, 502);
    const data = await r.json();
    const ice = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    return json({ iceServers: ice });
  },
};
