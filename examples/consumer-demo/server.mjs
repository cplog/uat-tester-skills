#!/usr/bin/env node
/**
 * Minimal demo web app for uat-harness-skill tier B/C runs.
 * Serves /, /settings, and /api/health on PORT (default 3000).
 */
import http from 'node:http';

const PORT = Number(process.env.PORT || 3000);

const pages = {
  '/': `<!DOCTYPE html>
<html lang="en"><head><title>Demo Home</title></head>
<body>
  <h1>Demo Home</h1>
  <a href="/settings" data-testid="nav-settings">Settings</a>
  <button data-testid="primary-cta">Get started</button>
</body></html>`,
  '/settings': `<!DOCTYPE html>
<html lang="en"><head><title>Demo Settings</title></head>
<body>
  <h1>Settings</h1>
  <form data-testid="settings-form">
    <label>Name <input name="name" value="demo" /></label>
    <button type="submit">Save</button>
  </form>
</body></html>`,
};

const server = http.createServer((req, res) => {
  const path = req.url?.split('?')[0] || '/';

  if (path === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'consumer-demo' }));
    return;
  }

  const html = pages[path];
  if (html) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`consumer-demo listening on http://127.0.0.1:${PORT}`);
});
