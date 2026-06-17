#!/usr/bin/env node
/**
 * Diff-scoped UAT scope review — minimal tiers/flows for the current change set.
 *
 * Usage:
 *   node review.mjs [--json|--pretty] [--base ref] [projectRoot]
 */
import { gatherSignals } from './context-signals.mjs';
import { printBanner } from './lib/banner.mjs';

function parseArgs(argv) {
  const out = { json: false, pretty: true, base: null, root: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--pretty') out.pretty = true;
    else if (argv[i] === '--base' && argv[i + 1]) out.base = argv[++i];
    else if (!argv[i].startsWith('--')) out.root = argv[i];
  }
  return out;
}

function sampleChangedFiles(files, max = 3) {
  return files.slice(0, max).join(', ') + (files.length > max ? ` +${files.length - max}` : '');
}

export function buildReviewReport(signals) {
  const lines = [];
  const runTiers = new Set();
  const runFlows = signals.inferred?.flows || [];
  const inferredTiers = new Set(signals.inferred?.tiers || []);
  const changed = signals.git?.changedFiles || [];
  const changedCount = signals.git?.changedCount || 0;

  if (!signals.setup?.hasManifest) {
    return {
      project_id: signals.setup?.projectId || null,
      clean: false,
      noManifest: true,
      lines: [{ tag: 'init', text: 'no uat-manifest.yml — run init before UAT' }],
      net: 'net: run init first.',
    };
  }

  if (!changedCount) {
    return {
      project_id: signals.setup?.projectId || null,
      clean: true,
      lines: [],
      net: 'Clean diff. Nothing to UAT.',
    };
  }

  const fileHint = sampleChangedFiles(changed);

  if (inferredTiers.has('A')) {
    runTiers.add('A');
    lines.push({
      tag: 'tier-a',
      text: `${changedCount} file(s) changed (${fileHint}) -> npm run uat:tier-a`,
    });
  } else {
    lines.push({ tag: 'skip', text: 'skip tier-a: no static/config/ui gate signals in diff' });
  }

  if (inferredTiers.has('B')) {
    if (signals.preflight?.reachable) {
      runTiers.add('B');
      lines.push({
        tag: 'tier-b',
        text: `api/ui/config touched -> npm run uat:tier-b`,
      });
    } else {
      lines.push({
        tag: 'preflight',
        text: `tier-b blocked: app down at ${signals.preflight?.baseUrl || 'base_url'} — start dev or set UAT_URL`,
      });
    }
  } else {
    lines.push({ tag: 'skip', text: 'skip tier-b: no smoke-relevant changes in diff' });
  }

  if (inferredTiers.has('C')) {
    if (signals.preflight?.reachable) {
      runTiers.add('C');
      const flowArg = runFlows.length ? ` --flows ${runFlows.join(',')}` : '';
      const flowHint = runFlows.length ? runFlows.join(', ') : 'all manifest flows';
      lines.push({
        tag: 'tier-c',
        text: `ui surface changed -> npm run uat:tier-c${flowArg} (${flowHint})`,
      });
    } else {
      lines.push({ tag: 'skip', text: 'skip tier-c: app not reachable for operator walkthrough' });
    }
  } else {
    lines.push({ tag: 'skip', text: 'skip tier-c: no ui/flow changes in diff' });
  }

  if (inferredTiers.has('D')) {
    runTiers.add('D');
    lines.push({ tag: 'tier-d', text: 'worker/cron paths in diff -> npm run uat:tier-d' });
  } else {
    lines.push({ tag: 'skip', text: 'skip tier-d: no worker/cron changes in diff' });
  }

  for (const svc of signals.inferred?.extraServices || []) {
    runTiers.add('E');
    lines.push({
      tag: 'tier-e',
      text: `extra service ${svc} touched -> npm run uat:tier-d -- --service ${svc}`,
    });
  }

  const tierPart = [...runTiers].sort().join(' + ') || 'none';
  const flowPart = runFlows.length ? runFlows.join(',') : 'all';
  const net = `net: run ${tierPart}${runTiers.has('C') ? ` C(${flowPart})` : ''}. ~${runTiers.size} tier(s)${runFlows.length ? `, ~${runFlows.length} flow(s)` : ''}.`;

  return {
    project_id: signals.setup?.projectId || null,
    branch: signals.git?.branch || null,
    base: signals.git?.base || null,
    changedCount,
    clean: false,
    lines,
    net,
    runTiers: [...runTiers],
    runFlows,
  };
}

function printPretty(report) {
  printBanner('compact');
  console.log(`# UAT review — ${report.project_id || 'project'}`);
  if (report.base) console.log(`base: ${report.base}`);
  console.log('');

  if (report.noManifest) {
    console.log(`init: ${report.lines[0]?.text || 'run init'}`);
    console.log(report.net);
    return;
  }

  if (report.clean) {
    console.log(report.net);
    return;
  }

  for (const line of report.lines) {
    console.log(`${line.tag}: ${line.text}`);
  }
  console.log('');
  console.log(report.net);
}

async function main() {
  const opts = parseArgs(process.argv);
  const signals = await gatherSignals(opts.root, { base: opts.base });
  const report = buildReviewReport(signals);

  if (opts.json) {
    console.log(JSON.stringify({ ...report, signals }, null, 2));
    return;
  }
  printPretty(report);
}

main();
