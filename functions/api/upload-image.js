function verifyToken(token, env) {
  try {
    const [data, sig] = token.split('.');
    if (btoa((env.JWT_SECRET || 'devlog') + ':' + data) !== sig) return false;
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
        content,
      }),
    }
  );

  if (!ghRes.ok) {
    const e = await ghRes.json();
    return json({ error: e.message || 'GitHub error' }, 502);
  }

  return json({ url: `https://raw.githubusercontent.com/diceeey/devlog-blog/main/${filename}` });
}
