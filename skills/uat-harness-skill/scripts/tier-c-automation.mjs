#!/usr/bin/env node
/**
 * Emit Tier C subagent dispatch instructions when CDP browser is available.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { url: '', manifest: '', flows: null, critical: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) out.url = argv[++i];
    else if (argv[i] === '--manifest' && argv[i + 1]) out.manifest = argv[++i];
    else if (argv[i] === '--flows' && argv[i + 1]) out.flows = argv[++i];
    else if (argv[i] === '--critical') out.critical = true;
  }
  return out;
}

function loadFlowsJson(manifestPath, opts) {
  const reader = path.join(SKILL_DIR, 'scripts', 'lib', 'read-manifest.mjs');
  const args = [reader, manifestPath, 'flows-json'];
  if (opts.flows) args.push('--flows', opts.flows);
  if (opts.critical) args.push('--critical');
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr || 'Failed to read flows from manifest');
    process.exit(1);
  }
  return JSON.parse(r.stdout);
}

function main() {
  const opts = parseArgs(process.argv);
  if (!opts.manifest || !fs.existsSync(opts.manifest)) {
    console.error('Missing or invalid --manifest');
    process.exit(1);
  }
  if (!opts.url) {
    console.error('Missing --url');
    process.exit(1);
  }

  const payload = loadFlowsJson(opts.manifest, opts);
  const browserCtl = path.join(SKILL_DIR, 'scripts', 'lib', 'browser-control.mjs');
  const cdp = process.env.UAT_CDP_URL || 'http://127.0.0.1:9222';

  console.log('=== Tier C — automated operator walkthrough (CDP) ===');
  console.log('');
  console.log(`Base URL: ${opts.url}`);
  console.log(`CDP: ${cdp}`);
  console.log('');
  console.log('## Agent instruction (main agent MUST follow)');
  console.log('');
  console.log('Dispatch a subagent (Task tool, `generalPurpose` or browser-capable agent) with this prompt:');
  console.log('');
  console.log('---');
  console.log(`You are the Tier C operator for project "${payload.project_id}".`);
  console.log(`Connect to the user's logged-in browser via CDP at ${cdp}.`);
  console.log(`Use shell commands to drive the browser:`);
  console.log(`  node ${browserCtl} ping`);
  console.log(`  node ${browserCtl} navigate <full-url>`);
  console.log(`  node ${browserCtl} text "<selector>"`);
  console.log(`  node ${browserCtl} click "<selector>"`);
  console.log(`  node ${browserCtl} screenshot /tmp/uat-tier-c-<flow-id>.png`);
  console.log('');
  console.log(`Base URL: ${opts.url}`);
  console.log('');
  console.log('For each flow below: navigate to the path under the base URL, verify every check,');
  console.log('report PASS or FAIL with evidence. On FAIL, capture a screenshot before moving on.');
  console.log('');
  for (const flow of payload.flows) {
    const route = (flow.path && flow.path[0]) || '/';
    const fullUrl = new URL(route, opts.url.endsWith('/') ? opts.url : `${opts.url}/`).href;
    console.log(`### Flow: ${flow.id}${flow.name ? ` (${flow.name})` : ''}`);
    console.log(`URL: ${fullUrl}`);
    for (const check of flow.checks || []) {
      console.log(`- [ ] ${check}`);
    }
    console.log('');
  }
  console.log('Return a structured verdict: flow id, each check pass/fail, failure reason, screenshot paths.');
  console.log('Do not modify application source code.');
  console.log('---');
  console.log('');
  console.log('## Flows JSON');
  console.log(JSON.stringify(payload, null, 2));
}

main();
