/**
 * Resolve and validate Tier A static commands (framework-aware).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function readPackageJson(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function parseMajor(version) {
  if (!version) return null;
  const cleaned = String(version).replace(/^[\^~>=<]+/, '');
  const major = Number.parseInt(cleaned.split('.')[0], 10);
  return Number.isFinite(major) ? major : null;
}

function nextMajor(pkg) {
  const raw = pkg?.dependencies?.next || pkg?.devDependencies?.next;
  return parseMajor(raw);
}

function hasEslintConfig(projectRoot) {
  const names = [
    'eslint.config.mjs',
    'eslint.config.js',
    'eslint.config.ts',
    'eslint.config.cjs',
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
  ];
  return names.some((n) => fs.existsSync(path.join(projectRoot, n)));
}

function lintScript(pkg) {
  return (pkg?.scripts?.lint || '').trim();
}

/**
 * Resolve a manifest static command for the consumer project.
 * Returns { cmd, warn?, error? } — error means skip/fail with message.
 */
export function resolveStaticCommand(projectRoot, cmd) {
  const trimmed = (cmd || '').trim();
  const pkg = readPackageJson(projectRoot);
  if (!pkg) return { cmd: trimmed };

  const isNpmLint = /^npm run lint\b/.test(trimmed) || trimmed === 'npm run lint';
  if (!isNpmLint) return { cmd: trimmed };

  const script = lintScript(pkg);
  const major = nextMajor(pkg);

  if (major !== null && major >= 16 && /^next\s+lint\b/.test(script)) {
    if (hasEslintConfig(projectRoot)) {
      return {
        cmd: 'npx eslint .',
        warn: 'Next.js 16+ removed `next lint`; running `eslint .` instead. Update package.json "lint" script.',
      };
    }
    return {
      cmd: trimmed,
      error:
        'Next.js 16+ no longer supports `next lint`. Migrate: npx @next/codemod@canary next-lint-to-eslint-cli . then set "lint": "eslint ." in package.json.',
    };
  }

  return { cmd: trimmed };
}

function main() {
  const [projectRoot, cmd] = process.argv.slice(2);
  if (!projectRoot || cmd === undefined) {
    console.error('Usage: static-preflight.mjs <projectRoot> <command>');
    process.exit(1);
  }
  const result = resolveStaticCommand(path.resolve(projectRoot), cmd);
  if (result.warn) console.error(`⚠ ${result.warn}`);
  if (result.error) {
    console.error(`✗ ${result.error}`);
    process.exit(1);
  }
  console.log(result.cmd);
}

const invoked =
  process.argv[1] &&
  fs.existsSync(process.argv[1]) &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (invoked) {
  main();
}
