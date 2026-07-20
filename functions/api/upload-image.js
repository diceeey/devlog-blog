import { verifyToken } from './auth.js';

export async function onRequestPost({ request, env }) {
  const { token, filename, content } = await request.json().catch(() => ({}));

  if (!verifyToken(token, env)) return json({ error: 'Unauthorized' }, 401);
  if (!filename || !content)   return json({ error: 'Missing filename or content' }, 400);

  const ghRes = await fetch(
    `https://api.github.com/repos/diceeey/devlog-blog/contents/${filename}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DevLog-CMS',
      },
      body: JSON.stringify({
        message: `Upload image: ${filename}`,
        content, // already base64
      }),
    }
  );

  if (!ghRes.ok) {
    const e = await ghRes.json();
    return json({ error: e.message || 'GitHub error' }, 502);
  }

  const url = `https://raw.githubusercontent.com/diceeey/devlog-blog/main/${filename}`;
  return json({ url });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
