#!/usr/bin/env node
/**
 * Audit uat-manifest.yml coverage vs repo discovery (UI routes + API endpoints).
 *
 * Usage:
 *   node audit.mjs [--json|--pretty] [--manifest path] [projectRoot]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { discoverAll, draftSuggestions, discoveryLikelyIncomplete } from './discover.mjs';
import { printBanner } from './lib/banner.mjs';
import { isFlowOrphan, normalizeRoute } from './lib/route-match.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { json: false, pretty: true, manifest: null, root: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--pretty') out.pretty = true;
    else if (argv[i] === '--manifest' && argv[i + 1]) out.manifest = argv[++i];
    else if (!argv[i].startsWith('--')) out.root = argv[i];
  }
  out.root = path.resolve(out.root);
  out.manifest = out.manifest
    ? path.resolve(out.manifest)
    : path.join(out.root, 'uat-manifest.yml');
  return out;
}

function loadManifestDoc(manifestPath) {
  const reader = path.join(__dirname, 'lib', 'read-manifest.mjs');
  const r = spawnSync(process.execPath, [reader, manifestPath, 'audit-doc'], { encoding: 'utf8' });
  if (r.status !== 0) return { flows: [], tiers: {}, deferred_coverage: [], project_id: null };
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { flows: [], tiers: {}, deferred_coverage: [], project_id: null };
  }
}

function flowPaths(flow) {
  return (flow.path || []).map(normalizeRoute);
}

function deferredPaths(manifestDoc) {
  const set = new Set();
  for (const d of manifestDoc.deferred_coverage || []) {
    if (d.path) set.add(normalizeRoute(d.path));
  }
  return set;
}

function buildFindings(discovery, manifestDoc, primaryRoot) {
  const manifestFlows = manifestDoc.flows || [];
  const deferred = deferredPaths(manifestDoc);
  const deferredList = manifestDoc.deferred_coverage || [];
  const incomplete = discoveryLikelyIncomplete(primaryRoot, discovery);

  const manifestPaths = new Set();
  for (const f of manifestFlows) {
    for (const p of flowPaths(f)) manifestPaths.add(normalizeRoute(p));
  }

  const discoveredUi = discovery.uiRoutes.map((r) => normalizeRoute(r.path));
  const discoveredApi = discovery.apiRoutes.map((r) => normalizeRoute(r.path));

  const missingUi = discovery.uiRoutes.filter((r) => {
    const p = normalizeRoute(r.path);
    return !manifestPaths.has(p) && !deferred.has(p);
  });
  const missingApi = discovery.apiRoutes.filter((r) => {
    const p = normalizeRoute(r.path);
    return !manifestPaths.has(p) && !deferred.has(p);
  });

  const discoveredSet = new Set([...discoveredUi, ...discoveredApi]);
  const orphanFlows = incomplete
    ? []
    : manifestFlows.filter((f) => isFlowOrphan(f, discoveredSet, discovery.uiRoutes));

  const findings = [];

  if (incomplete && manifestFlows.length) {
    findings.push({
      tag: 'discovery-gap',
      rank: 0,
      text:
        'App router detected but 0 UI routes found — update skill: npx skills update uat-harness-skill -y (orphan checks suppressed)',
    });
  }

  for (const r of missingUi) {
    findings.push({
      tag: 'missing-ui',
      rank: 1,
      text: `${r.path}  <- ${r.source}`,
    });
  }
  for (const r of missingApi) {
    const method = r.method ? `${r.method} ` : '';
    findings.push({
      tag: 'missing-api',
      rank: 2,
      text: `${method}${r.path}  <- ${r.source}`,
    });
  }
  for (const f of orphanFlows) {
    const paths = (f.path || []).join(', ');
    findings.push({
      tag: 'orphan',
      rank: 3,
      text: `${f.id}  <- ${paths} not found in repo`,
    });
  }
  for (const f of manifestFlows) {
    if (!(f.checks || []).length) {
      findings.push({
        tag: 'no-checks',
        rank: 4,
        text: `${f.id}  <- flow has 0 checks`,
      });
    }
  }
  if (manifestFlows.length && !manifestFlows.some((f) => f.critical)) {
    findings.push({
      tag: 'no-critical',
      rank: 5,
      text: `flows[]  <- no flow marked critical: true`,
    });
  }
  for (const d of deferredList) {
    if (!d.path) continue;
    const reason = d.reason ? ` (${d.reason})` : '';
    findings.push({
      tag: 'deferred',
      rank: 6,
      text: `${normalizeRoute(d.path)}${reason}`,
    });
  }

  findings.sort((a, b) => a.rank - b.rank || a.text.localeCompare(b.text));

  const draft = draftSuggestions(discovery);
  const hasSmoke = Boolean(manifestDoc.tiers?.smoke?.length);
  const hasStatic = Boolean(manifestDoc.tiers?.static?.length);

  const gapCount =
    missingUi.length + missingApi.length + orphanFlows.length + manifestFlows.filter((f) => !(f.checks || []).length).length;

  const issueCount = missingUi.length + missingApi.length + orphanFlows.length +
    manifestFlows.filter((f) => !(f.checks || []).length).length +
    (manifestFlows.length && !manifestFlows.some((f) => f.critical) ? 1 : 0);

  let net;
  if (issueCount === 0) {
    net = 'Lean already. Ship.';
  } else {
    net = `net: ${missingUi.length} untested ui, ${missingApi.length} untested api, ${orphanFlows.length} orphan, ${manifestFlows.filter((f) => !(f.checks || []).length).length} no-checks.`;
  }

  return {
    project_id: manifestDoc.project_id || null,
    manifestPath: manifestDoc.manifestPath || 'uat-manifest.yml',
    findings,
    summary: {
      ui_discovered: discovery.uiRoutes.length,
      api_discovered: discovery.apiRoutes.length,
      flows_in_manifest: manifestFlows.length,
      missing_ui: missingUi.length,
      missing_api: missingApi.length,
      orphan_flows: orphanFlows.length,
      deferred_count: deferredList.length,
      discovery_incomplete: incomplete,
      has_smoke_tier: hasSmoke,
      has_static_tier: hasStatic,
      suggested_smoke: draft.tiers.smoke,
      issue_count: issueCount,
      gap_count: gapCount,
    },
    missing_ui: missingUi,
    missing_api: missingApi,
    orphan_flows: orphanFlows.map((f) => ({ id: f.id, path: f.path })),
    deferred: deferredList,
    suggestions: draft,
    net,
  };
}

function printPretty(report) {
  printBanner('compact');
  console.log(`# UAT audit — ${report.project_id || 'project'}`);
  console.log('');
  console.log('Coverage gaps only. Code quality / security / perf -> normal review.');
  console.log('');

  if (report.summary.issue_count === 0) {
    for (const f of report.findings.filter((x) => x.tag === 'deferred')) {
      console.log(`deferred: ${f.text}`);
    }
    if (report.findings.some((x) => x.tag === 'deferred')) console.log('');
    console.log(report.net);
    return;
  }

  for (const f of report.findings) {
    if (f.tag === 'deferred') {
      console.log(`deferred: ${f.text}`);
    } else {
      console.log(`${f.tag}: ${f.text}`);
    }
  }
  console.log('');
  console.log(report.net);

  if (!report.summary.has_smoke_tier && report.summary.suggested_smoke?.length) {
    console.log('');
    console.log('suggested-smoke:');
    for (const c of report.summary.suggested_smoke) {
      console.log(`  - ${c}`);
    }
  }
}

function main() {
  const opts = parseArgs(process.argv);
  const discovery = discoverAll(opts.root);

  if (!fs.existsSync(opts.manifest)) {
    console.error(`No manifest at ${opts.manifest}. Run init first.`);
    const draft = draftSuggestions(discovery);
    if (opts.json) {
      console.log(JSON.stringify({ error: 'NO_MANIFEST', discovery, draft }, null, 2));
    } else {
      console.log('NO_MANIFEST — run init first.');
      for (const r of discovery.uiRoutes) {
        console.log(`missing-ui: ${r.path}  <- ${r.source}`);
      }
      for (const r of discovery.apiRoutes) {
        const method = r.method ? `${r.method} ` : '';
        console.log(`missing-api: ${method}${r.path}  <- ${r.source}`);
      }
      console.log('');
      console.log(`net: ${discovery.uiRoutes.length} untested ui, ${discovery.apiRoutes.length} untested api.`);
    }
    process.exit(1);
  }

  const manifestDoc = loadManifestDoc(opts.manifest);
  manifestDoc.manifestPath = path.relative(opts.root, opts.manifest);
  const report = buildFindings(discovery, manifestDoc, opts.root);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printPretty(report);
}

main();
