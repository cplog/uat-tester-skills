/**
 * Pre-flight health checks so agents set up and test correctly.
 * Used by setup, context-signals, and audit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoveryLikelyIncomplete } from '../discover.mjs';
import { resolveStaticCommand } from './static-preflight.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '../..');

export function skillSupportsSrcApp() {
  try {
    const text = fs.readFileSync(path.join(SKILL_ROOT, 'scripts', 'discover.mjs'), 'utf8');
    return text.includes('src\\/app');
  } catch {
    return false;
  }
}

function readPackageJson(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function hasAppRouterLayout(projectRoot) {
  return (
    fs.existsSync(path.join(projectRoot, 'src', 'app')) ||
    fs.existsSync(path.join(projectRoot, 'app'))
  );
}

/**
 * Run health checks before setup, audit, or tier runs.
 * Returns { ok, blockers[], warnings[], fixes[] }.
 */
export function assessProjectHealth(projectRoot, discovery, manifestDoc = null) {
  const blockers = [];
  const warnings = [];
  const fixes = [];

  if (!skillSupportsSrcApp() && hasAppRouterLayout(projectRoot)) {
    blockers.push({
      id: 'stale-skill',
      message: 'Installed skill is outdated (missing src/app discovery).',
      fix: 'npx skills@latest update uat-harness-skill -y',
    });
    fixes.push('npx skills@latest update uat-harness-skill -y');
  }

  if (discovery && discoveryLikelyIncomplete(projectRoot, discovery)) {
    blockers.push({
      id: 'discovery-gap',
      message: 'App router detected but 0 UI routes discovered — audit orphans are unreliable.',
      fix: 'npx skills@latest update uat-harness-skill -y',
    });
    if (!fixes.includes('npx skills@latest update uat-harness-skill -y')) {
      fixes.push('npx skills@latest update uat-harness-skill -y');
    }
  }

  const staticCmds = manifestDoc?.tiers?.static || [];
  for (const cmd of staticCmds) {
    const resolved = resolveStaticCommand(projectRoot, cmd);
    if (resolved.error) {
      blockers.push({
        id: 'next-lint-removed',
        message: resolved.error,
        fix: 'npx @next/codemod@canary next-lint-to-eslint-cli .',
      });
      fixes.push('npx @next/codemod@canary next-lint-to-eslint-cli .');
    } else if (resolved.warn) {
      warnings.push({ id: 'next-lint-fallback', message: resolved.warn });
    }
  }

  const pkg = readPackageJson(projectRoot);
  const nextRaw = pkg?.dependencies?.next || pkg?.devDependencies?.next;
  if (nextRaw && !manifestDoc?.tiers?.static?.length && pkg?.scripts?.lint === 'next lint') {
    warnings.push({
      id: 'next-lint-script',
      message: 'package.json uses "next lint" but Next 16+ removed it — migrate before Tier A.',
      fix: 'npx @next/codemod@canary next-lint-to-eslint-cli .',
    });
  }

  if (!manifestDoc && !fs.existsSync(path.join(projectRoot, 'uat-manifest.yml'))) {
    blockers.push({
      id: 'no-manifest',
      message: 'No uat-manifest.yml — run setup before tiers.',
      fix: 'node .agents/skills/uat-harness-skill/scripts/setup.mjs --yes',
    });
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    fixes: [...new Set(fixes)],
  };
}

export function formatHealthPretty(health) {
  const lines = [];
  if (health.ok && !health.warnings.length) {
    lines.push('health: OK — discovery and static tier look ready.');
    return lines.join('\n');
  }
  for (const b of health.blockers) {
    lines.push(`blocker: ${b.message}`);
    if (b.fix) lines.push(`  fix: ${b.fix}`);
  }
  for (const w of health.warnings) {
    lines.push(`warning: ${w.message}`);
    if (w.fix) lines.push(`  fix: ${w.fix}`);
  }
  if (health.fixes.length) {
    lines.push('');
    lines.push('Run fixes before audit or tier-a:');
    for (const f of health.fixes) lines.push(`  ${f}`);
  }
  return lines.join('\n');
}
