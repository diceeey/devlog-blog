import { verifyToken, makeToken } from './auth.js';

export async function onRequestPost({ request, env }) {
  const { token, oldPassword, newPassword } = await request.json().catch(() => ({}));

  if (!verifyToken(token, env)) return json({ error: 'Session expired, sign in again' }, 401);
  if (!oldPassword || !newPassword)  return json({ error: 'Missing fields' }, 400);
  if (newPassword.length < 8)        return json({ error: 'Password must be at least 8 characters' }, 400);

  // Verify old password
  const stored = env.ADMIN_PASSWORD;
  if (oldPassword !== stored) return json({ error: 'Current password is incorrect' }, 403);

  // Update password via Cloudflare API
  const accountId   = env.CF_ACCOUNT_ID;
  const cfToken     = env.CF_API_TOKEN;
  const projectName = env.CF_PROJECT_NAME || 'devlog-blog';

  if (!accountId || !cfToken) {
    return json({ error: 'CF_ACCOUNT_ID and CF_API_TOKEN not configured' }, 500);
  }

  const cfRes = await fetch(
    `https://api.cloudflare.com/client/v4/pages/projects/${projectName}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${cfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deployment_configs: {
          production: {
            env_vars: {
              ADMIN_PASSWORD: { value: newPassword },
            },
          },
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
