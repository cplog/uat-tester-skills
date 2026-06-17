#!/usr/bin/env node
/**
 * Project-specific UAT tailoring brief for agents.
 * Combines discovery, health, audit, and flow-group suggestions so the agent
 * customizes uat-manifest.yml + UAT.md per project — not a generic template.
 *
 * Usage:
 *   node tailor.mjs [--json|--pretty] [--manifest path] [projectRoot]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { discoverAll } from './discover.mjs';
import { assessProjectHealth } from './lib/health.mjs';
import {
  findProjectDocs,
  suggestDeferred,
  suggestFlowGroups,
} from './lib/tailor-helpers.mjs';
import { printBanner } from './lib/banner.mjs';

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
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

function detectAuthHints(projectRoot) {
  const hints = [];
  for (const name of ['.env.example', '.env.local.example', 'middleware.ts', 'middleware.js']) {
    const abs = path.join(projectRoot, name);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    if (/auth0|AUTH0/i.test(text)) hints.push('Auth0');
    if (/magic.?link|MAGIC_LINK/i.test(text)) hints.push('magic-link');
    if (/next-auth|NextAuth/i.test(text)) hints.push('NextAuth');
    if (/supabase.*auth/i.test(text)) hints.push('Supabase auth');
  }
  const srcMiddleware = path.join(projectRoot, 'src', 'middleware.ts');
  if (fs.existsSync(srcMiddleware)) {
    const text = fs.readFileSync(srcMiddleware, 'utf8');
    if (/auth0|login|protected/i.test(text)) hints.push('middleware-protected routes');
  }
  return [...new Set(hints)];
}

function detectLocale(projectRoot, manifestDoc) {
  if (manifestDoc?.locale?.default) return manifestDoc.locale.default;
  if (fs.existsSync(path.join(projectRoot, 'src', 'i18n'))) return '(i18n detected — set locale.default in manifest)';
  return null;
}

function manifestFlowIds(manifestDoc) {
  return new Set((manifestDoc?.flows || []).map((f) => f.id));
}

function buildAgentTasks({ health, hasManifest, flowGroups, docs, authHints }) {
  const tasks = [];
  let n = 1;

  if (!health.ok) {
    for (const fix of health.fixes) {
      tasks.push({ step: n++, action: 'fix_blocker', command: fix, reason: health.blockers[0]?.message });
    }
  }

  if (!hasManifest) {
    tasks.push({
      step: n++,
      action: 'scaffold',
      command: 'node .agents/skills/uat-harness-skill/scripts/setup.mjs --yes',
      reason: 'Create uat-manifest.yml skeleton — then customize (do not commit generic flows as-is)',
    });
  }

  tasks.push({
    step: n++,
    action: 'read_docs',
    paths: Object.values(docs),
    reason: 'Read project docs before writing checks — tailor flows to real operator journeys',
  });

  tasks.push({
    step: n++,
    action: 'customize_flows',
    reason: `Merge ${flowGroups.length} suggested flow groups into flows[] — one flow per operator surface, not one per page`,
    hint: 'Use suggested_checks as starting point; replace with project-specific checks from USERFLOW/AGENTS.md',
  });

  tasks.push({
    step: n++,
    action: 'mark_critical',
    reason: 'Set critical: true on login, dashboard, checkout/billing, and primary revenue paths',
  });

  if (authHints.length) {
    tasks.push({
      step: n++,
      action: 'configure_auth',
      reason: `Auth detected (${authHints.join(', ')}) — add safety_notes + Tier C login prerequisite`,
    });
  }

  tasks.push({
    step: n++,
    action: 'write_uat_md',
    command: 'Copy templates/UAT.md from skill; fill Audience, Critical paths, Environments',
    reason: 'UAT.md is the operator brief agents read alongside the manifest',
  });

  tasks.push({
    step: n++,
    action: 'fill_project_context',
    reason: 'Add project_context: block to uat-manifest.yml (audience, auth, journeys, out_of_scope)',
  });

  tasks.push({
    step: n++,
    action: 'verify',
    command: 'node .agents/skills/uat-harness-skill/scripts/audit.mjs --pretty',
    reason: 'Re-run audit until critical paths covered; defer webhooks/docs via deferred_coverage',
  });

  return tasks;
}

function buildInterviewQuestions({ flowGroups, manifestDoc, authHints, locale }) {
  const questions = [];
  const existing = manifestFlowIds(manifestDoc);

  if (flowGroups.length > 15 && existing.size < 8) {
    questions.push('Which operator surfaces are in scope for UAT? (suggested groups listed — pick critical subset)');
  }
  if (authHints.length) {
    questions.push(`Auth uses ${authHints.join(' + ')} — should Tier C run logged-in, and how do we obtain test credentials?`);
  }
  if (locale) {
    questions.push(`Default locale is ${locale} — should UAT include locale toggle / zh-TW layout checks?`);
  }
  if (!(manifestDoc?.tiers?.smoke || []).length) {
    questions.push('Deploy smoke: existing script, health endpoint, or skip Tier B for local-only?');
  }
  if (questions.length === 0) {
    questions.push('Any flows to explicitly defer (admin, webhooks, legal pages)?');
  }
  return questions.slice(0, 4);
}

export function buildTailorBrief(projectRoot, manifestPath) {
  const hasManifest = fs.existsSync(manifestPath);
  const manifestDoc = hasManifest ? loadManifestDoc(manifestPath) : null;
  const discovery = discoverAll(projectRoot);
  const health = assessProjectHealth(projectRoot, discovery, manifestDoc);
  const docs = findProjectDocs(projectRoot);
  const authHints = detectAuthHints(projectRoot);
  const locale = detectLocale(projectRoot, manifestDoc);
  const flowGroups = suggestFlowGroups(discovery.uiRoutes);
  const deferCandidates = suggestDeferred(discovery.apiRoutes, discovery.uiRoutes);
  const existingFlowIds = [...manifestFlowIds(manifestDoc)];

  const missingFromManifest = flowGroups.filter(
    (g) => !existingFlowIds.includes(g.suggested_id) && !existingFlowIds.includes(g.suggested_id.replace(/-/g, '_'))
  );
  const staleInManifest = (manifestDoc?.flows || []).filter((f) => {
    const paths = f.path || [];
    if (!paths.length) return true;
    return !paths.some((p) => discovery.uiRoutes.some((r) => r.path === p || r.path.startsWith(p)));
  });

  const agentTasks = buildAgentTasks({
    health,
    hasManifest,
    flowGroups,
    docs,
    authHints,
  });
  const interviewQuestions = buildInterviewQuestions({
    flowGroups,
    manifestDoc,
    authHints,
    locale,
  });

  return {
    project_id: manifestDoc?.project_id || path.basename(projectRoot),
    project_root: projectRoot,
    has_manifest: hasManifest,
    manifest_path: hasManifest ? path.relative(projectRoot, manifestPath) : 'uat-manifest.yml',
    framework: discovery.projects?.[0]?.framework || 'unknown',
    health,
    discovery_summary: {
      ui_routes: discovery.uiRoutes.length,
      api_routes: discovery.apiRoutes.length,
      suggested_flow_groups: flowGroups.length,
      existing_flows: existingFlowIds.length,
    },
    project_docs: docs,
    auth_hints: authHints,
    locale,
    suggested_flow_groups: flowGroups,
    defer_candidates: deferCandidates.slice(0, 30),
    manifest_gaps: {
      missing_flow_groups: missingFromManifest.map((g) => g.suggested_id),
      possibly_stale_flows: staleInManifest.map((f) => f.id),
    },
    interview_questions: interviewQuestions,
    agent_tasks: agentTasks,
    tiers_from_discovery: discovery.scripts,
  };
}

function printPretty(brief) {
  printBanner('compact');
  console.log(`# UAT tailor — ${brief.project_id}`);
  console.log('');
  console.log('Agent: customize uat-manifest.yml + UAT.md for THIS project. Do not ship generic template flows.');
  console.log('');

  console.log(`Framework: ${brief.framework} · UI routes: ${brief.discovery_summary.ui_routes} · API: ${brief.discovery_summary.api_routes}`);
  console.log(`Manifest: ${brief.has_manifest ? brief.manifest_path : '(missing — scaffold first)'}`);
  console.log(`Health: ${brief.health.ok ? 'OK' : `BLOCKED — ${brief.health.blockers.map((b) => b.id).join(', ')}`}`);
  console.log('');

  if (Object.keys(brief.project_docs).length) {
    console.log('## Project docs (read before writing checks)');
    for (const [k, v] of Object.entries(brief.project_docs)) console.log(`- ${k}: ${v}`);
    console.log('');
  }

  if (brief.auth_hints.length || brief.locale) {
    console.log('## Project signals');
    if (brief.auth_hints.length) console.log(`- Auth: ${brief.auth_hints.join(', ')}`);
    if (brief.locale) console.log(`- Locale: ${brief.locale}`);
    console.log('');
  }

  console.log('## Suggested flow groups (feature-level — tailor checks per project)');
  for (const g of brief.suggested_flow_groups.slice(0, 20)) {
    const crit = g.critical ? ' [critical]' : '';
    console.log(`- ${g.suggested_id}${crit}: ${g.primary_path} (+${Math.max(0, g.route_count - 1)} related routes)`);
    for (const c of g.suggested_checks.slice(0, 2)) console.log(`    check: ${c}`);
  }
  if (brief.suggested_flow_groups.length > 20) {
    console.log(`- … +${brief.suggested_flow_groups.length - 20} more groups`);
  }
  console.log('');

  if (brief.manifest_gaps.possibly_stale_flows.length) {
    console.log('## Review existing manifest flows');
    for (const id of brief.manifest_gaps.possibly_stale_flows) {
      console.log(`- stale?: ${id} — verify paths still match repo`);
    }
    console.log('');
  }

  if (brief.defer_candidates.length) {
    console.log('## Defer candidates (deferred_coverage — not operator UAT)');
    for (const d of brief.defer_candidates.slice(0, 8)) {
      console.log(`- ${d.path} — ${d.reason}`);
    }
    if (brief.defer_candidates.length > 8) console.log(`- … +${brief.defer_candidates.length - 8} more`);
    console.log('');
  }

  console.log('## Ask the user (only if not clear from docs)');
  for (const q of brief.interview_questions) console.log(`- ${q}`);
  console.log('');

  console.log('## Agent tasks');
  for (const t of brief.agent_tasks) {
    const cmd = t.command ? ` → \`${t.command}\`` : '';
    console.log(`${t.step}. **${t.action}**${cmd} — ${t.reason}`);
  }
  console.log('');
  console.log('After tailoring: add `project_context:` to manifest and write `UAT.md` at project root.');
}

function main() {
  const opts = parseArgs(process.argv);
  const brief = buildTailorBrief(opts.root, opts.manifest);
  if (opts.json) {
    console.log(JSON.stringify(brief, null, 2));
    return;
  }
  printPretty(brief);
}

const invoked =
  process.argv[1] &&
  fs.existsSync(process.argv[1]) &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (invoked) {
  main();
}
