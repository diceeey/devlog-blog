function makeToken(env) {
  const exp  = Date.now() + 8 * 60 * 60 * 1000;
  const data = btoa(JSON.stringify({ exp }));
  const sig  = btoa((env.JWT_SECRET || 'devlog') + ':' + data);
  return data + '.' + sig;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost({ request, env }) {
  const { password } = await request.json().catch(() => ({}));
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD)
    return json({ error: 'Wrong password' }, 401);
  return json({ token: makeToken(env) });
}
