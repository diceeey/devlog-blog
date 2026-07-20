// Helper functions
function makeToken(env) {
  const exp  = Date.now() + 8 * 60 * 60 * 1000;
  const data = btoa(JSON.stringify({ exp }));
  const sig  = btoa((env.JWT_SECRET || 'devlog') + ':' + data);
  return data + '.' + sig;
}

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

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Route handlers
async function handleAuth(request, env) {
  const { password } = await request.json().catch(() => ({}));
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD)
    return json({ error: 'Wrong password' }, 401);
  return json({ token: makeToken(env) });
}

async function handlePublish(request, env) {
  const { token, title, excerpt, tags, body } = await request.json().catch(() => ({}));
  if (!verifyToken(token, env)) return json({ error: 'Unauthorized' }, 401);
  if (!title || !body) return json({ error: 'Title and body required' }, 400);

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const date = new Date().toISOString().split('T')[0];
  const path = `_posts/${date}-${slug}.html`;
  const tagHtml = (tags || []).map(t => `<span class="post-tag">${esc(t)}</span>`).join(' ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${esc(title)} — DevLog</title>
  <link rel="stylesheet" href="../style.css"/>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"/>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>
  <script>hljs.highlightAll();<\/script>
</head>
<body>
  <header class="site-header">
    <div class="container nav-inner">
      <a href="../index.html" class="logo"><span>{</span>DevLog<span>}</span></a>
      <nav><a href="../index.html">Home</a><a href="../about.html">About</a></nav>
    </div>
  </header>
  <main>
    <article class="post-article">
      <div class="container">
        <header class="post-header">
          <div>${tagHtml}</div>
          <h1>${esc(title)}</h1>
          <div class="post-header-meta">
            <span>📅 ${new Date(date).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</span>
          </div>
        </header>
        <div class="post-body">${body}</div>
      </div>
    </article>
  </main>
  <footer class="site-footer">
    <div class="container footer-inner">
      <div class="footer-left">&copy; 2026 <strong>{DevLog}</strong></div>
      <div class="footer-links"><a href="../index.html">Home</a><a href="../about.html">About</a></div>
    </div>
  </footer>
</body>
</html>`;

  const ghRes = await fetch(
    `https://api.github.com/repos/diceeey/devlog-blog/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DevLog-CMS',
      },
      body: JSON.stringify({
        message: `New post: ${title}`,
        content: btoa(unescape(encodeURIComponent(html))),
      }),
    }
  );

  if (!ghRes.ok) {
    const e = await ghRes.json();
    return json({ error: e.message || 'GitHub error — check GITHUB_TOKEN' }, 502);
  }

  return json({ success: true, path });
}

async function handleUploadImage(request, env) {
  const { token, filename, content } = await request.json().catch(() => ({}));
  if (!verifyToken(token, env)) return json({ error: 'Unauthorized' }, 401);
  if (!filename || !content) return json({ error: 'Missing filename or content' }, 400);

  const ghRes = await fetch(
    `https://api.github.com/repos/diceeey/devlog-blog/contents/${filename}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'DevLog-CMS',
      },
      body: JSON.stringify({ message: `Upload image: ${filename}`, content }),
    }
  );

  if (!ghRes.ok) {
    const e = await ghRes.json();
    return json({ error: e.message || 'GitHub error' }, 502);
  }

  return json({ url: `https://raw.githubusercontent.com/diceeey/devlog-blog/main/${filename}` });
}

async function handleChangePassword(request, env) {
  const { token, oldPassword, newPassword } = await request.json().catch(() => ({}));
  if (!verifyToken(token, env)) return json({ error: 'Session expired' }, 401);
  if (!oldPassword || !newPassword) return json({ error: 'Missing fields' }, 400);
  if (newPassword.length < 8) return json({ error: 'Min 8 characters' }, 400);
  if (oldPassword !== env.ADMIN_PASSWORD) return json({ error: 'Current password incorrect' }, 403);

  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN)
    return json({ error: 'CF_ACCOUNT_ID / CF_API_TOKEN not set' }, 500);

  const cfRes = await fetch(
    `https://api.cloudflare.com/client/v4/pages/projects/${env.CF_PROJECT_NAME || 'devlog-blog'}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_configs: { production: { env_vars: { ADMIN_PASSWORD: { value: newPassword } } } },
      }),
    }
  );

  if (!cfRes.ok) {
    const e = await cfRes.json();
    return json({ error: e.errors?.[0]?.message || 'CF API error' }, 502);
  }

  return json({ token: makeToken(env) });
}

// Main fetch handler
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST') {
      if (path === '/api/auth')            return handleAuth(request, env);
      if (path === '/api/publish')         return handlePublish(request, env);
      if (path === '/api/upload-image')    return handleUploadImage(request, env);
      if (path === '/api/change-password') return handleChangePassword(request, env);
    }

    // Serve static assets
    return env.ASSETS.fetch(request);
  },
};
