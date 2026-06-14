#!/usr/bin/env node
/**
 * Preflight: resolve UAT base URL and verify the app responds.
 * Usage:
 *   node preflight.mjs [--url https://…] [--require]
 * Env: UAT_URL overrides manifest base_url
 * Exit 0 if reachable (or --require not set and only warning); exit 1 if --require and unreachable.
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext } from './context.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  let url = process.env.UAT_URL?.trim() || '';
  let requireReachable = false;
  let healthPath = '';

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) {
      url = argv[++i];
    } else if (argv[i] === '--require') {
      requireReachable = true;
    } else if (argv[i] === '--health' && argv[i + 1]) {
      healthPath = argv[++i];
    }
  }
  return { url, requireReachable, healthPath };
}

function probeUrl(targetUrl, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      resolve({ ok: false, status: 0, error: 'invalid URL' });
      return;
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        timeout: timeoutMs,
        headers: { Accept: 'text/html,application/json' },
      },
      (res) => {
        res.resume();
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: 'timeout' });
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, error: e.message }));
    req.end();
  });
}

export async function runPreflight(cwd = process.cwd(), opts = {}) {
  const ctx = loadContext(cwd);
  const doc = ctx.doc || {};
  const baseUrl = (opts.url || doc.base_url || 'http://localhost:3000').replace(/\/$/, '');
  const healthPath = opts.healthPath || doc.preflight?.health_path || '/api/tower/runtime';
  const healthUrl = `${baseUrl}${healthPath.startsWith('/') ? healthPath : `/${healthPath}`}`;

  const [rootProbe, healthProbe] = await Promise.all([
    probeUrl(`${baseUrl}/`),
    probeUrl(healthUrl),
  ]);

  const reachable = rootProbe.ok || healthProbe.ok;
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(baseUrl);

  return {
    baseUrl,
    healthUrl,
    reachable,
    isLocalhost,
    probes: { root: rootProbe, health: healthProbe },
    manifestPath: ctx.manifestPath,
    projectId: doc.project_id || null,
    hints: reachable
      ? []
      : isLocalhost
        ? [
            'Start the app: npm run dev',
            'Or use a deployed preview: npm run uat:tier-b -- --url https://your-preview.vercel.app',
            'Or export UAT_URL=https://… before running tiers',
          ]
        : [
            'Check the deployment URL is live and reachable',
            'Pass --url explicitly if the preview moved',
          ],
  };
}

async function cli() {
  const { url, requireReachable, healthPath } = parseArgs(process.argv);
  const result = await runPreflight(process.cwd(), { url: url || undefined, healthPath: healthPath || undefined });

  const pretty = process.argv.includes('--pretty');
  if (pretty) {
    const lines = [
      `# UAT preflight — ${result.projectId || 'project'}`,
      '',
      `**URL:** ${result.baseUrl}`,
      `**Reachable:** ${result.reachable ? 'yes' : 'no'}`,
      `**Root:** ${result.probes.root.ok ? `HTTP ${result.probes.root.status}` : result.probes.root.error || 'failed'}`,
      `**Health:** ${result.probes.health.ok ? `HTTP ${result.probes.health.status}` : result.probes.health.error || 'failed'} (${result.healthUrl})`,
    ];
    if (!result.reachable && result.hints.length) {
      lines.push('', '**Before Tier B / Tier C UI:**');
      for (const h of result.hints) lines.push(`- ${h}`);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }

  if (requireReachable && !result.reachable) {
    process.exit(1);
  }
}

const invoked =
  process.argv[1] &&
  fs.existsSync(process.argv[1]) &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (invoked) {
  cli();
}
