/**
 * UAT context loader — Impeccable-style boot script.
 * Prints project manifest summary + optional UAT.md on stdout.
 * Exit 0 always; agent branches on NO_MANIFEST directive.
 *
 * Path resolution (first match wins):
 * 1. $UAT_MANIFEST if set
 * 2. ./uat-manifest.yml at cwd
 * 3. $UAT_CONTEXT_DIR/uat-manifest.yml
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const UAT_MD_NAMES = ['UAT.md', 'uat.md'];
const FALLBACK_DIRS = ['.agents/context', 'setup/docs/guides', 'docs'];

export function resolveManifestPath(cwd = process.cwd()) {
  const env = process.env.UAT_MANIFEST?.trim();
  if (env) {
    return path.isAbsolute(env) ? env : path.resolve(cwd, env);
  }
  const root = path.resolve(cwd, 'uat-manifest.yml');
  if (fs.existsSync(root)) return root;
  const ctxDir = process.env.UAT_CONTEXT_DIR?.trim();
  if (ctxDir) {
    const base = path.isAbsolute(ctxDir) ? ctxDir : path.resolve(cwd, ctxDir);
    const candidate = path.join(base, 'uat-manifest.yml');
    if (fs.existsSync(candidate)) return candidate;
  }
  return root;
}

function resolveUatMd(cwd) {
  if (firstExisting(cwd, UAT_MD_NAMES)) return firstExisting(cwd, UAT_MD_NAMES);
  for (const rel of FALLBACK_DIRS) {
    const hit = firstExisting(path.resolve(cwd, rel), UAT_MD_NAMES);
    if (hit) return hit;
  }
  return null;
}

function firstExisting(dir, names) {
  for (const name of names) {
    const abs = path.join(dir, name);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function safeRead(p) {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

function loadYaml(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const candidates = [
    path.join(path.dirname(filePath), 'node_modules/js-yaml'),
    path.resolve(__dirname, '../../../uat-harness-skill/node_modules/js-yaml'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return require(c).load(text);
    }
  }
  // Delegate to read-manifest minimal parser via dynamic import
  return parseMinimalManifest(text);
}

/** Inline minimal parse — enough for context summary (mirrors read-manifest.mjs). */
function parseMinimalManifest(text) {
  const doc = {
    project_id: null,
    base_url: null,
    flows: [],
    tiers: { static: [], smoke: [], worker: [], extra_services: [] },
    destructive_commands: [],
    safety_notes: [],
    docs: {},
  };
  let section = null;
  let tierKey = null;
  let inFlows = false;
  let currentFlow = null;
  let inExtra = false;
  let currentService = null;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s*#.*$/, '');
    if (!line.trim()) continue;
    const pid = line.match(/^project_id:\s*(.+)/);
    if (pid) { doc.project_id = pid[1].trim(); continue; }
    const url = line.match(/^base_url:\s*(.+)/);
    if (url) { doc.base_url = url[1].trim(); continue; }
    const uf = line.match(/^  userflow:\s*(.+)/);
    if (uf) { doc.docs.userflow = uf[1].trim(); continue; }
    if (line.trim() === 'tiers:') { section = 'tiers'; continue; }
    if (line.trim() === 'flows:') { section = 'flows'; inFlows = true; continue; }
    if (line.trim() === 'destructive_commands:') { section = 'destructive'; continue; }
    if (line.trim() === 'safety_notes:') { section = 'safety'; continue; }
    if (section === 'tiers') {
      if (line.trim() === 'extra_services:') { inExtra = true; tierKey = null; continue; }
      const tm = line.match(/^  (\w+):\s*$/);
      if (tm && !inExtra) { tierKey = tm[1]; doc.tiers[tierKey] = doc.tiers[tierKey] || []; continue; }
      const cm = line.match(/^    - (.+)$/);
      if (cm && tierKey && !inExtra) { doc.tiers[tierKey].push(cm[1].trim()); continue; }
      if (inExtra) {
        const sm = line.match(/^    - id:\s*(.+)/);
        if (sm) { currentService = { id: sm[1].trim() }; doc.tiers.extra_services.push(currentService); continue; }
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
      const im = line.match(/^  - id:\s*(.+)/);
      if (im) { currentFlow = { id: im[1].trim() }; doc.flows.push(currentFlow); continue; }
    }
  }
  return doc;
}

export function loadContext(cwd = process.cwd()) {
  const manifestPath = resolveManifestPath(cwd);
  const hasManifest = fs.existsSync(manifestPath);
  const doc = hasManifest ? loadYaml(manifestPath) : null;
  const uatMdPath = resolveUatMd(cwd);
  const uatMd = uatMdPath ? safeRead(uatMdPath) : null;

  return {
    hasManifest,
    manifestPath: hasManifest ? path.relative(cwd, manifestPath) : manifestPath,
    doc,
    uatMd,
    uatMdPath: uatMdPath ? path.relative(cwd, uatMdPath) : null,
  };
}

function formatManifestSummary(doc) {
  if (!doc) return '';
  const lines = [
    `# uat-manifest.yml`,
    ``,
    `- **project_id:** ${doc.project_id || '(missing)'}`,
    `- **base_url:** ${doc.base_url || '(missing)'}`,
    `- **flows:** ${(doc.flows || []).map((f) => f.id).join(', ') || '(none)'}`,
    `- **tiers.static:** ${(doc.tiers?.static || []).length} command(s)`,
    `- **tiers.smoke:** ${(doc.tiers?.smoke || []).length} command(s)`,
    `- **tiers.worker:** ${(doc.tiers?.worker || []).length} command(s)`,
    `- **extra_services:** ${(doc.tiers?.extra_services || []).map((s) => s.id).join(', ') || '(none)'}`,
    `- **destructive_commands:** ${(doc.destructive_commands || []).length}`,
  ];
  if (doc.safety_notes?.length) {
    lines.push('', '**Safety notes:**');
    for (const n of doc.safety_notes) lines.push(`- ${n}`);
  }
  if (doc.docs?.userflow) {
    lines.push('', `**Operator doc:** ${doc.docs.userflow}`);
  }
  return lines.join('\n');
}

async function cli() {
  const cwd = process.cwd();
  const ctx = loadContext(cwd);

  if (!ctx.hasManifest || !ctx.doc) {
    process.stdout.write(
      'NO_MANIFEST: This project has no uat-manifest.yml yet. ' +
        'Stop and follow reference/init.md to scaffold one (or copy templates/manifest-template.yml) before running UAT.\n'
    );
    return;
  }

  const parts = [formatManifestSummary(ctx.doc)];
  if (ctx.uatMd) {
    parts.push(`# UAT.md\n\n${ctx.uatMd.trim()}`);
  }
  parts.push(
    'NEXT STEP: If the user named a sub-command (init, tier-a, tier-b, tier-c, tier-d, report), read reference/<command>.md. ' +
      'Otherwise infer minimum tier from change scope and user message; subset flows when requested.'
  );
  process.stdout.write(parts.join('\n\n---\n\n') + '\n');
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  cli();
}
