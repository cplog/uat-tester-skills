#!/usr/bin/env node
/**
 * Read uat-manifest.yml for tier scripts and agents.
 * Usage:
 *   node read-manifest.mjs <manifest> commands static
 *   node read-manifest.mjs <manifest> checklist [--flows id1,id2] [--critical]
 *   node read-manifest.mjs <manifest> meta project_id
 *   node read-manifest.mjs <manifest> safety
 *   node read-manifest.mjs <manifest> destructive
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function resolveJsYaml(manifestPath) {
  const root = path.dirname(manifestPath);
  const candidates = [
    path.join(root, 'node_modules/js-yaml'),
    path.resolve(root, 'uat-harness-skill/node_modules/js-yaml'),
    path.resolve(__dirname, '../../../../uat-harness-skill/node_modules/js-yaml'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function loadYaml(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const yamlPath = resolveJsYaml(filePath);
  if (yamlPath) {
    const yaml = require(yamlPath);
    return yaml.load(text);
  }
  return parseMinimalYaml(text);
}

/** Fallback when js-yaml is not installed — covers tier command lists only. */
function parseMinimalYaml(text) {
  const doc = { tiers: { extra_services: [] }, flows: [], destructive_commands: [], safety_notes: [] };
  let section = null;
  let tierKey = null;
  let inFlows = false;
  let currentFlow = null;
  let inExtraServices = false;
  let currentService = null;
  let inServiceCommands = false;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s*#.*$/, '');
    if (!line.trim()) continue;

    if (/^project_id:\s*(.+)/.test(line)) {
      doc.project_id = line.match(/^project_id:\s*(.+)/)[1].trim();
      continue;
    }
    if (/^base_url:\s*(.+)/.test(line)) {
      doc.base_url = line.match(/^base_url:\s*(.+)/)[1].trim();
      continue;
    }
    if (line.trim() === 'tiers:') {
      section = 'tiers';
      continue;
    }
    if (line.trim() === 'flows:') {
      section = 'flows';
      inFlows = true;
      inExtraServices = false;
      continue;
    }
    if (line.trim() === 'destructive_commands:') {
      section = 'destructive';
      inFlows = false;
      continue;
    }
    if (line.trim() === 'safety_notes:') {
      section = 'safety';
      inFlows = false;
      continue;
    }

    if (section === 'tiers') {
      if (line.trim() === 'extra_services:') {
        inExtraServices = true;
        tierKey = null;
        continue;
      }
      const tierMatch = line.match(/^  (\w+):\s*$/);
      if (tierMatch && !inExtraServices) {
        tierKey = tierMatch[1];
        doc.tiers[tierKey] = [];
        continue;
      }
      const cmdMatch = line.match(/^    - (.+)$/);
      if (cmdMatch && tierKey && !inExtraServices) {
        doc.tiers[tierKey].push(cmdMatch[1].trim());
        continue;
      }
      if (inExtraServices) {
        const svcMatch = line.match(/^    - id:\s*(.+)/);
        if (svcMatch) {
          currentService = { id: svcMatch[1].trim(), commands: [] };
          doc.tiers.extra_services.push(currentService);
          inServiceCommands = false;
          continue;
        }
        if (line.trim() === 'commands:') {
          inServiceCommands = true;
          continue;
        }
        const svcCmd = line.match(/^        - (.+)$/);
        if (svcCmd && currentService && inServiceCommands) {
          currentService.commands.push(svcCmd[1].trim());
        }
      }
    }

    if (section === 'destructive') {
      const m = line.match(/^  - (.+)$/);
      if (m) doc.destructive_commands.push(m[1].trim());
    }

    if (section === 'safety') {
      const m = line.match(/^  - (.+)$/);
      if (m) doc.safety_notes.push(m[1].trim());
    }

    if (inFlows) {
      const idMatch = line.match(/^  - id:\s*(.+)/);
      if (idMatch) {
        currentFlow = { id: idMatch[1].trim(), path: [], checks: [] };
        doc.flows.push(currentFlow);
        continue;
      }
      const nameMatch = line.match(/^    name:\s*(.+)/);
      if (nameMatch && currentFlow) {
        currentFlow.name = nameMatch[1].trim();
        continue;
      }
      const pathMatch = line.match(/^    path:\s*\[(.+)\]/);
      if (pathMatch && currentFlow) {
        currentFlow.path = pathMatch[1].split(',').map((s) => s.trim());
        continue;
      }
      const checkMatch = line.match(/^      - (.+)$/);
      if (checkMatch && currentFlow) {
        currentFlow.checks.push(checkMatch[1].trim());
      }
      const criticalMatch = line.match(/^    critical:\s*(true|false)/);
      if (criticalMatch && currentFlow) {
        currentFlow.critical = criticalMatch[1] === 'true';
      }
    }
  }

  return doc;
}

function getCommands(doc, tier, serviceId) {
  const tiers = doc.tiers || {};
  if (tier === 'extra' && serviceId) {
    const svc = (tiers.extra_services || []).find((s) => s.id === serviceId);
    return svc?.commands || [];
  }
  if (tier === 'worker_all') {
    return [...(tiers.worker || []), ...(tiers.worker_optional || [])];
  }
  return tiers[tier] || [];
}

function printChecklist(doc, opts) {
  const flows = getFilteredFlows(doc, opts);

  console.log(`Operator UAT — ${doc.project_id || 'project'}`);
  for (const flow of flows) {
    const route = (flow.path && flow.path[0]) || '/';
    const label = flow.name || flow.id;
    const checks = (flow.checks || []).join('; ');
    console.log(`- [ ] ${label} (${route})${checks ? ` — ${checks}` : ''}`);
  }

  const locale = doc.locale || {};
  if (locale.toggle) {
    console.log(`- [ ] Locale — toggle (${locale.default || 'default'} ↔ alt) without layout break`);
  }
  if (locale.viewport_min) {
    const max = locale.viewport_max || locale.viewport_min;
    console.log(`- [ ] No horizontal scroll at ${locale.viewport_min}–${max}px`);
  }
}

function getFilteredFlows(doc, opts) {
  let flows = doc.flows || [];
  if (opts.critical) {
    flows = flows.filter((f) => f.critical);
  }
  if (opts.flows) {
    const ids = new Set(opts.flows.split(',').map((s) => s.trim()));
    flows = flows.filter((f) => ids.has(f.id));
  }
  return flows;
}

function printFlowsJson(doc, opts) {
  const flows = getFilteredFlows(doc, opts);
  console.log(
    JSON.stringify(
      {
        project_id: doc.project_id || null,
        base_url: doc.base_url || null,
        locale: doc.locale || {},
        flows,
      },
      null,
      2
    )
  );
}

function main() {
  const [manifestPath, command, ...rest] = process.argv.slice(2);
  if (!manifestPath || !command) {
    console.error('Usage: read-manifest.mjs <manifest> <command> [args]');
    process.exit(1);
  }

  const resolved = path.resolve(manifestPath);
  if (!fs.existsSync(resolved)) {
    console.error(`Manifest not found: ${resolved}`);
    process.exit(1);
  }

  const doc = loadYaml(resolved);

  if (command === 'commands') {
    const tier = rest[0];
    const serviceId = rest[1];
    const cmds = getCommands(doc, tier, serviceId);
    for (const cmd of cmds) console.log(cmd);
    return;
  }

  if (command === 'smoke_url_flag') {
    console.log(doc.tiers?.smoke_url_flag || '');
    return;
  }

  if (command === 'checklist') {
    const opts = { flows: null, critical: false };
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--flows') opts.flows = rest[++i];
      if (rest[i] === '--critical') opts.critical = true;
    }
    printChecklist(doc, opts);
    return;
  }

  if (command === 'flows-json') {
    const opts = { flows: null, critical: false };
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--flows') opts.flows = rest[++i];
      if (rest[i] === '--critical') opts.critical = true;
    }
    printFlowsJson(doc, opts);
    return;
  }

  if (command === 'audit-doc') {
    console.log(
      JSON.stringify(
        {
          project_id: doc.project_id || null,
          flows: doc.flows || [],
          tiers: doc.tiers || {},
          linked_repos: doc.linked_repos || [],
        },
        null,
        2
      )
    );
    return;
  }

  if (command === 'meta') {
    const key = rest[0];
    if (key === 'project_id') console.log(doc.project_id || '');
    else if (key === 'base_url') console.log(doc.base_url || '');
    else console.error(`Unknown meta key: ${key}`);
    return;
  }

  if (command === 'safety') {
    for (const note of doc.safety_notes || []) console.log(note);
    return;
  }

  if (command === 'destructive') {
    for (const cmd of doc.destructive_commands || []) console.log(cmd);
    return;
  }

  if (command === 'extra_service_ids') {
    for (const svc of doc.tiers?.extra_services || []) console.log(svc.id);
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main();
