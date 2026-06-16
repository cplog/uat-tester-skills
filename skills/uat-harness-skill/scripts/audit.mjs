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
import { discoverAll, draftSuggestions } from './discover.mjs';

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
  if (r.status !== 0) return { flows: [], tiers: {}, project_id: null };
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { flows: [], tiers: {}, project_id: null };
  }
}

function normalizeRoute(p) {
  return p.replace(/\/+$/, '') || '/';
}

function flowPaths(flow) {
  return (flow.path || []).map(normalizeRoute);
}

function auditCoverage(discovery, manifestDoc) {
  const manifestFlows = manifestDoc.flows || [];
  const manifestPaths = new Set();
  for (const f of manifestFlows) {
    for (const p of flowPaths(f)) manifestPaths.add(normalizeRoute(p));
  }

  const discoveredUi = discovery.uiRoutes.map((r) => normalizeRoute(r.path));
  const discoveredApi = discovery.apiRoutes.map((r) => normalizeRoute(r.path));

  const missingUi = discovery.uiRoutes.filter((r) => !manifestPaths.has(normalizeRoute(r.path)));
  const missingApi = discovery.apiRoutes.filter((r) => !manifestPaths.has(normalizeRoute(r.path)));

  const discoveredSet = new Set([...discoveredUi, ...discoveredApi]);
  const orphanFlows = manifestFlows.filter((f) => {
    const paths = flowPaths(f);
    if (!paths.length) return false;
    return paths.every((p) => !discoveredSet.has(p));
  });

  const draft = draftSuggestions(discovery);
  const hasSmoke = Boolean(manifestDoc.tiers?.smoke?.length);
  const hasStatic = Boolean(manifestDoc.tiers?.static?.length);

  return {
    project_id: manifestDoc.project_id || null,
    manifestPath: manifestDoc.manifestPath || 'uat-manifest.yml',
    summary: {
      ui_discovered: discovery.uiRoutes.length,
      api_discovered: discovery.apiRoutes.length,
      flows_in_manifest: manifestFlows.length,
      missing_ui: missingUi.length,
      missing_api: missingApi.length,
      orphan_flows: orphanFlows.length,
      has_smoke_tier: hasSmoke,
      has_static_tier: hasStatic,
      suggested_smoke: draft.tiers.smoke,
    },
    missing_ui: missingUi,
    missing_api: missingApi,
    orphan_flows: orphanFlows.map((f) => ({ id: f.id, path: f.path })),
    suggestions: draft,
  };
}

function printPretty(report) {
  console.log(`# UAT audit — ${report.project_id || 'project'}`);
  console.log('');
  console.log('## Summary');
  console.log(`- UI routes discovered: ${report.summary.ui_discovered}`);
  console.log(`- API routes discovered: ${report.summary.api_discovered}`);
  console.log(`- Flows in manifest: ${report.summary.flows_in_manifest}`);
  console.log(`- Missing UI coverage: ${report.summary.missing_ui}`);
  console.log(`- Missing API coverage: ${report.summary.missing_api}`);
  console.log(`- Orphan flows (not in repo): ${report.summary.orphan_flows}`);
  console.log(`- tiers.static configured: ${report.summary.has_static_tier ? 'yes' : 'no'}`);
  console.log(`- tiers.smoke configured: ${report.summary.has_smoke_tier ? 'yes' : 'no'}`);
  console.log('');

  if (report.missing_ui.length) {
    console.log('## Missing UI flows (add to flows[])');
    for (const r of report.missing_ui.slice(0, 20)) {
      console.log(`- ${r.path} ← ${r.source}`);
    }
    if (report.missing_ui.length > 20) console.log(`- … ${report.missing_ui.length - 20} more`);
    console.log('');
  }

  if (report.missing_api.length) {
    console.log('## Missing API coverage (add flow checks or tiers.smoke)');
    for (const r of report.missing_api.slice(0, 20)) {
      const method = r.method ? `${r.method} ` : '';
      console.log(`- ${method}${r.path} ← ${r.source}`);
    }
    if (report.missing_api.length > 20) console.log(`- … ${report.missing_api.length - 20} more`);
    console.log('');
  }

  if (report.orphan_flows.length) {
    console.log('## Orphan flows (in manifest but not discovered — verify or remove)');
    for (const f of report.orphan_flows) {
      console.log(`- ${f.id}: ${(f.path || []).join(', ')}`);
    }
    console.log('');
  }

  if (!report.summary.has_smoke_tier && report.summary.suggested_smoke.length) {
    console.log('## Suggested tiers.smoke');
    for (const c of report.summary.suggested_smoke) console.log(`- ${c}`);
    console.log('');
  }

  console.log('## Next steps');
  console.log('- Run `node <skill-dir>/scripts/discover.mjs --draft` for full manifest snippets');
  console.log('- Run agent `init` to merge suggestions into uat-manifest.yml');
  console.log('- Re-run `node <skill-dir>/scripts/audit.mjs` after updating manifest');
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
      console.log('NO_MANIFEST — suggested starting flows from discovery:\n');
      printPretty({
        project_id: null,
        summary: {
          ui_discovered: discovery.uiRoutes.length,
          api_discovered: discovery.apiRoutes.length,
          flows_in_manifest: 0,
          missing_ui: discovery.uiRoutes.length,
          missing_api: discovery.apiRoutes.length,
          orphan_flows: 0,
          has_smoke_tier: false,
          has_static_tier: false,
          suggested_smoke: draft.tiers.smoke,
        },
        missing_ui: discovery.uiRoutes,
        missing_api: discovery.apiRoutes,
        orphan_flows: [],
        suggestions: draft,
      });
    }
    process.exit(1);
  }

  const manifestDoc = loadManifestDoc(opts.manifest);
  manifestDoc.manifestPath = path.relative(opts.root, opts.manifest);
  const report = auditCoverage(discovery, manifestDoc);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printPretty(report);
}

main();
