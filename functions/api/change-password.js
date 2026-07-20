function verifyToken(token, env) {
  try {
    const [data, sig] = token.split('.');
    if (btoa((env.JWT_SECRET || 'devlog') + ':' + data) !== sig) return false;
    const { exp } = JSON.parse(atob(data));
    return Date.now() < exp;
  } catch { return false; }
}

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
  const { token, oldPassword, newPassword } = await request.json().catch(() => ({}));

  if (!verifyToken(token, env)) return json({ error: 'Session expired, sign in again' }, 401);
  if (!oldPassword || !newPassword) return json({ error: 'Missing fields' }, 400);
  if (newPassword.length < 8)       return json({ error: 'Password must be at least 8 characters' }, 400);
  if (oldPassword !== env.ADMIN_PASSWORD) return json({ error: 'Current password is incorrect' }, 403);

  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN)
    return json({ error: 'CF_ACCOUNT_ID and CF_API_TOKEN not configured' }, 500);

  const cfRes = await fetch(
    `https://api.cloudflare.com/client/v4/pages/projects/${env.CF_PROJECT_NAME || 'devlog-blog'}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deployment_configs: {
          production: { env_vars: { ADMIN_PASSWORD: { value: newPassword } } },
        },
      }),
    }
  );

  if (!cfRes.ok) {
    const e = await cfRes.json();
    return json({ error: e.errors?.[0]?.message || 'Cloudflare API error' }, 502);
  }

  return json({ token: makeToken(env) });
}
