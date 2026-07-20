export async function onRequestPost({ request, env }) {
  const { password } = await request.json().catch(() => ({}));
  const stored = env.ADMIN_PASSWORD;
  if (!stored || password !== stored) return json({ error: 'Wrong password' }, 401);
  return json({ token: makeToken(env) });
}

export function makeToken(env) {
  const exp    = Date.now() + 8 * 60 * 60 * 1000;
  const secret = env.JWT_SECRET || 'devlog';
  const data   = btoa(JSON.stringify({ exp }));
  const sig    = btoa(secret + ':' + data);
  return data + '.' + sig;
}

export function verifyToken(token, env) {
  try {
    const [data, sig] = token.split('.');
    const secret = env.JWT_SECRET || 'devlog';
    if (btoa(secret + ':' + data) !== sig) return false;
    const { exp } = JSON.parse(atob(data));
    return Date.now() < exp;
  } catch { return false; }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
