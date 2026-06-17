#!/usr/bin/env node
/**
 * Context-signals for bare "run UAT" requests (Impeccable-style).
 * Emits JSON: git scope, dev server, inferred tiers/flows from manifest.
 * Does NOT run tiers — agent reasons over signals + SKILL.md routing.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadContext } from './context.mjs';
import { runPreflight } from './preflight.mjs';

const COMMON_DEV_PORTS = [3000, 4321, 5173, 5174, 8080, 8100, 8200];

const WORKER_HINTS = [
  /^scripts\//,
  /cron/i,
  /worker/i,
  /scraper/i,
  /opencli/i,
  /health-check/i,
  /daily-monitor/i,
  /stealth/i,
  /ingest-social/i,
  /verify-sources/i,
];

const API_HINTS = [/^app\/api\//, /^lib\/db/, /^lib\/persist/];

const CONFIG_HINTS = [
  /package\.json$/,
  /next\.config/,
  /tailwind/,
  /globals\.css$/,
  /tsconfig/,
];

function gitSignals(cwd, baseOverride = null) {
  const run = (args, { trim = true } = {}) => {
    try {
      const out = execFileSync('git', args, {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return trim ? out.trim() : out;
    } catch {
      return null;
    }
  };

  if (run(['rev-parse', '--is-inside-work-tree']) !== 'true') {
    return { isRepo: false, branch: null, base: null, changedFiles: [], changedCount: 0 };
  }

  const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
  let resolvedBase = baseOverride;
  if (!resolvedBase) {
    for (const b of ['main', 'master']) {
      if (run(['rev-parse', '--verify', '--quiet', b]) !== null) {
        resolvedBase = b;
        break;
      }
    }
  } else if (run(['rev-parse', '--verify', '--quiet', resolvedBase]) === null) {
    resolvedBase = null;
  }

  const diffBase = baseOverride
    ? resolvedBase
    : resolvedBase && branch && branch !== resolvedBase
      ? resolvedBase
      : null;
  const fromDiff = diffBase ? run(['diff', '--name-only', `${diffBase}...HEAD`]) : null;
  const fromStatus = run(['-c', 'core.quotepath=false', 'status', '--porcelain'], { trim: false });

  let changed = [];
  if (fromDiff) {
    changed = fromDiff.split('\n').filter(Boolean);
  } else if (fromStatus) {
    changed = fromStatus
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => {
        const p = l.slice(3);
        const arrow = p.indexOf(' -> ');
        return arrow === -1 ? p : p.slice(arrow + 4);
      });
  }

  return {
    isRepo: true,
    branch,
    base: diffBase,
    changedFiles: changed.slice(0, 80),
    changedCount: changed.length,
  };
}

function probePort(port, timeout = 250) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, '127.0.0.1');
  });
}

async function devServerSignals() {
  const open = [];
  await Promise.all(
    COMMON_DEV_PORTS.map(async (p) => {
      if (await probePort(p)) open.push(p);
    }),
  );
  open.sort((a, b) => a - b);
  return { running: open.length > 0, ports: open };
}

/** Map changed paths → manifest flow ids (generic heuristics). */
export function inferFlows(changedFiles, flows = []) {
  const ids = new Set();
  const flowList = flows.map((f) => ({
    id: f.id,
    paths: (f.path || []).map((p) => p.replace(/^\//, '')),
  }));

  for (const file of changedFiles) {
    const norm = file.replace(/\\/g, '/').toLowerCase();

    for (const flow of flowList) {
      const id = flow.id;
      if (
        norm.includes(`app/${id}/`) ||
        norm.includes(`components/${id}/`) ||
        norm.includes(`lib/${id}-`) ||
        norm.includes(`lib/${id}/`)
      ) {
        ids.add(id);
      }
      for (const seg of flow.paths) {
        if (!seg || seg === '') {
          if (norm === 'app/page.tsx' || norm.endsWith('/app/page.tsx')) ids.add(id);
          continue;
        }
        if (norm.includes(`app/${seg}/`) || norm.includes(`app/${seg}.`)) ids.add(id);
      }
    }

    if (norm.includes('components/intel/') || norm.includes('components/dashboard/')) {
      const dash = flowList.find((f) => f.id === 'dashboard');
      if (dash) ids.add('dashboard');
    }
    if (norm.includes('i18n') || norm.includes('locale')) {
      const loc = flowList.find((f) => f.id === 'locale');
      if (loc) ids.add('locale');
    }
    if (norm.includes('components/layout/') || norm.includes('app/layout')) {
      for (const f of flowList) ids.add(f.id);
    }
  }

  return [...ids];
}

/** Map changed paths → tier letters A–E. */
export function inferTiers(changedFiles, doc) {
  const tiers = new Set();
  let ui = false;
  let api = false;
  let worker = false;
  let daq = false;
  let config = false;

  for (const file of changedFiles) {
    const norm = file.replace(/\\/g, '/');

    if (norm.includes('services/data-acquisition') || /^services\/[^/]+\//.test(norm)) {
      const svc = (doc?.tiers?.extra_services || []).find((s) => norm.includes(s.id));
      if (svc) daq = true;
      else if (norm.includes('data-acquisition')) daq = true;
    }

    if (WORKER_HINTS.some((re) => re.test(norm))) worker = true;
    if (API_HINTS.some((re) => re.test(norm))) api = true;
    if (norm.startsWith('app/') && !norm.startsWith('app/api/')) ui = true;
    if (norm.startsWith('components/')) ui = true;
    if (CONFIG_HINTS.some((re) => re.test(norm))) config = true;
  }

  if (config || ui) tiers.add('A');
  if (api || ui || config) tiers.add('B');
  if (ui) tiers.add('C');
  if (worker) tiers.add('D');
  if (daq) tiers.add('E');

  if (!tiers.size && changedFiles.length) {
    tiers.add('A');
    tiers.add('B');
  }

  return [...tiers].sort();
}

export function inferExtraServices(changedFiles, doc) {
  const services = doc?.tiers?.extra_services || [];
  const hits = [];
  for (const svc of services) {
    const id = svc.id;
    if (changedFiles.some((f) => f.replace(/\\/g, '/').includes(id) || f.includes(`services/${id}`))) {
      hits.push(id);
    }
  }
  if (changedFiles.some((f) => f.includes('services/data-acquisition')) && !hits.includes('daq')) {
    if (services.some((s) => s.id === 'daq')) hits.push('daq');
  }
  return hits;
}

export function buildRecommendations({ tiers, flows, extraServices, devServer, doc, preflight }) {
  const recs = [];
  const flowArg = flows.length ? ` --flows ${flows.join(',')}` : '';
  const baseUrl = preflight?.baseUrl || doc?.base_url || 'http://localhost:3000';
  const urlArg = preflight?.reachable ? '' : '  # blocked until app is up';
  const deployUrlFlag = preflight?.reachable && !preflight?.isLocalhost
    ? ` --url ${baseUrl}`
    : '';

  if (!preflight?.reachable && (tiers.includes('B') || tiers.includes('C'))) {
    recs.push({
      tier: 'preflight',
      command: 'npm run dev',
      reason: `App not reachable at ${baseUrl} — start local dev or set UAT_URL / --url to a deployed preview`,
    });
    if (preflight?.hints?.length) {
      recs.push({
        tier: 'preflight',
        command: `UAT_URL=https://preview.vercel.app npm run uat:tier-b`,
        reason: preflight.hints[1] || 'Use deployed preview URL',
      });
    }
  }

  if (tiers.includes('A')) {
    recs.push({
      tier: 'A',
      command: 'npm run uat:tier-a',
      reason: 'Static gate — lint + build from manifest tiers.static',
    });
  }
  if (tiers.includes('B')) {
    if (preflight?.reachable) {
      recs.push({
        tier: 'B',
        command: `npm run uat:tier-b${deployUrlFlag}`,
        reason: `Deployment smoke against ${baseUrl}`,
      });
    }
  }
  if (tiers.includes('C')) {
    if (preflight?.reachable) {
      recs.push({
        tier: 'C',
        command: `npm run uat:tier-c${flowArg}${deployUrlFlag}`,
        reason: flows.length
          ? `Operator walkthrough at ${baseUrl} — flows: ${flows.join(', ')}`
          : `Operator walkthrough at ${baseUrl} — all manifest flows`,
      });
    }
  }
  if (tiers.includes('D')) {
    recs.push({
      tier: 'D',
      command: 'npm run uat:tier-d',
      reason: 'Background job lane — confirm read-only DB unless user approves writes',
    });
  }
  for (const svc of extraServices) {
    recs.push({
      tier: 'E',
      command: `npm run uat:tier-d -- --service ${svc}`,
      reason: `Extra service smoke: ${svc}`,
    });
  }
  recs.push({
    tier: 'report',
    command: 'reference/report.md',
    reason: 'After tiers complete, write UAT report with evidence',
  });

  return recs.slice(0, 5);
}

export async function gatherSignals(cwd = process.cwd(), options = {}) {
  const ctx = loadContext(cwd);
  const git = gitSignals(cwd, options.base || null);
  const devServer = await devServerSignals();
  const doc = ctx.doc || { flows: [], tiers: {} };

  const flows = inferFlows(git.changedFiles, doc.flows || []);
  const tiers = inferTiers(git.changedFiles, doc);
  const extraServices = inferExtraServices(git.changedFiles, doc);
  const preflight = await runPreflight(cwd, { url: process.env.UAT_URL?.trim() || undefined });

  const recommendations = ctx.hasManifest
    ? buildRecommendations({ tiers, flows, extraServices, devServer, doc, preflight })
    : [{ tier: 'init', command: 'reference/init.md', reason: 'No uat-manifest.yml — scaffold first' }];

  return {
    setup: {
      hasManifest: ctx.hasManifest,
      manifestPath: ctx.manifestPath,
      projectId: doc.project_id || null,
      flowIds: (doc.flows || []).map((f) => f.id),
      hasUatMd: !!ctx.uatMd,
    },
    git,
    devServer,
    preflight: {
      baseUrl: preflight.baseUrl,
      reachable: preflight.reachable,
      isLocalhost: preflight.isLocalhost,
      hints: preflight.hints,
    },
    inferred: {
      tiers,
      flows,
      extraServices,
    },
    recommendations,
  };
}

async function cli() {
  const pretty = process.argv.includes('--pretty');
  const signals = await gatherSignals(process.cwd());

  if (pretty) {
    const lines = [
      `# UAT signals — ${signals.setup.projectId || 'project'}`,
      '',
      `**Branch:** ${signals.git.branch || 'n/a'} · **Changed:** ${signals.git.changedCount} file(s)`,
      `**Dev server (port probe):** ${signals.devServer.running ? signals.devServer.ports.join(', ') : 'not detected'}`,
      `**App HTTP preflight:** ${signals.preflight.reachable ? `OK — ${signals.preflight.baseUrl}` : `DOWN — ${signals.preflight.baseUrl}`}`,
      '',
      `**Inferred tiers:** ${signals.inferred.tiers.join(', ') || '(none)'}`,
      `**Inferred flows:** ${signals.inferred.flows.join(', ') || '(all or unspecified)'}`,
    ];
    if (signals.inferred.extraServices.length) {
      lines.push(`**Extra services:** ${signals.inferred.extraServices.join(', ')}`);
    }
    if (signals.git.changedFiles.length) {
      lines.push('', '**Changed files (sample):**');
      for (const f of signals.git.changedFiles.slice(0, 12)) lines.push(`- ${f}`);
      if (signals.git.changedCount > 12) lines.push(`- … +${signals.git.changedCount - 12} more`);
    }
    lines.push('', '**Recommendations:**');
    for (const r of signals.recommendations) {
      lines.push(`- **Tier ${r.tier}:** \`${r.command}\` — ${r.reason}`);
    }
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(signals, null, 2)}\n`);
}

const invoked =
  process.argv[1] &&
  fs.existsSync(process.argv[1]) &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (invoked) {
  cli();
}
