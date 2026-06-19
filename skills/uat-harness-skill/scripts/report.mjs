#!/usr/bin/env node
/**
 * Aggregate UAT failure evidence into structured bug reports.
 *
 * Usage:
 *   node report.mjs [options]
 *
 * Options:
 *   --manifest <path>      Manifest path (default ./uat-manifest.yml)
 *   --evidence-dir <path>  Evidence directory (default ./.uat/evidence)
 *   --out <path>          Report output directory (default ./.uat/reports)
 *   --format md|json|both Output format (default both)
 *   --pretty              Pretty-print console output
 *   --severity <min>      Minimum severity to include (default low)
 *   --re-diagnose         Re-run diagnosis even if diagnosis.json exists
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runDiagnosis } from './lib/diagnose-failure.mjs';
import { generateMarkdownReport, generateJsonReport, sortBugs } from './lib/generate-report.mjs';
import { exportBugs, getDefaultRepo } from './lib/gh-export.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

function parseArgs(argv) {
  const out = {
    manifest: './uat-manifest.yml',
    evidenceDir: './.uat/evidence',
    outDir: './.uat/reports',
    format: 'both',
    pretty: false,
    severity: 'low',
    reDiagnose: false,
    ghExport: false,
    ghRepo: '',
    forceGh: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest' && argv[i + 1]) out.manifest = argv[++i];
    else if (a === '--evidence-dir' && argv[i + 1]) out.evidenceDir = argv[++i];
    else if (a === '--out' && argv[i + 1]) out.outDir = argv[++i];
    else if (a === '--format' && argv[i + 1]) out.format = argv[++i];
    else if (a === '--pretty') out.pretty = true;
    else if (a === '--severity' && argv[i + 1]) out.severity = argv[++i];
    else if (a === '--re-diagnose') out.reDiagnose = true;
    else if (a === '--gh-export') out.ghExport = true;
    else if (a === '--gh-repo' && argv[i + 1]) out.ghRepo = argv[++i];
    else if (a === '--force-gh') out.forceGh = true;
  }
  return out;
}

function resolvePath(input, base) {
  return path.resolve(base, input);
}

function readManifestMeta(manifestPath) {
  const reader = path.join(__dirname, 'lib', 'read-manifest.mjs');
  const projectId = spawnSync(process.execPath, [reader, manifestPath, 'meta', 'project_id'], {
    encoding: 'utf8',
    timeout: 10000,
  }).stdout.trim();
  const baseUrl = spawnSync(process.execPath, [reader, manifestPath, 'meta', 'base_url'], {
    encoding: 'utf8',
    timeout: 10000,
  }).stdout.trim();
  const reportingRaw = spawnSync(process.execPath, [reader, manifestPath, 'reporting'], {
    encoding: 'utf8',
    timeout: 10000,
  }).stdout.trim();
  let reporting = {};
  if (reportingRaw) {
    try {
      reporting = JSON.parse(reportingRaw);
    } catch {
      /* ignore */
    }
  }
  return { projectId, baseUrl, reporting };
}

function getGitMeta(projectRoot) {
  try {
    const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 5000,
    }).stdout.trim();
    const commit = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 5000,
    }).stdout.trim();
    return { branch, commit };
  } catch {
    return { branch: '', commit: '' };
  }
}

function listEvidenceDirs(evidenceDir) {
  if (!fs.existsSync(evidenceDir)) return [];
  return fs
    .readdirSync(evidenceDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(evidenceDir, d.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'metadata.json')));
}

async function loadOrRunDiagnosis(dir, reDiagnose) {
  const cached = path.join(dir, 'diagnosis.json');
  if (!reDiagnose && fs.existsSync(cached)) {
    try {
      return JSON.parse(fs.readFileSync(cached, 'utf8'));
    } catch {
      /* fall through to re-run */
    }
  }
  const diagnosis = await runDiagnosis(dir);
  fs.writeFileSync(cached, JSON.stringify(diagnosis, null, 2));
  return diagnosis;
}

function severityMeets(min, value) {
  return (SEVERITY_RANK[value] || 0) >= (SEVERITY_RANK[min] || 0);
}

async function main() {
  const args = parseArgs(process.argv);
  const projectRoot = process.cwd();
  const manifestPath = resolvePath(args.manifest, projectRoot);

  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  const { projectId, baseUrl, reporting } = readManifestMeta(manifestPath);

  // Merge manifest reporting config with CLI args
  const effectiveEvidenceDir = resolvePath(
    args.evidenceDir || reporting.evidence_dir || './.uat/evidence',
    projectRoot
  );
  const effectiveOutDir = resolvePath(
    args.outDir || reporting.report_dir || './.uat/reports',
    projectRoot
  );
  const effectiveSeverity = args.severity || reporting.severity_threshold || 'low';

  fs.mkdirSync(effectiveOutDir, { recursive: true });

  const dirs = listEvidenceDirs(effectiveEvidenceDir);
  if (dirs.length === 0) {
    console.log('No evidence bundles found. Run a Tier C test first, or pass --evidence-dir.');
    return;
  }

  const bugs = [];
  for (const dir of dirs) {
    const diagnosis = await loadOrRunDiagnosis(dir, args.reDiagnose);
    if (severityMeets(effectiveSeverity, diagnosis.severity)) {
      bugs.push(diagnosis);
    }
  }

  const git = getGitMeta(projectRoot);
  const sorted = sortBugs(bugs);
  const reportOptions = {
    projectId,
    appUrl: baseUrl,
    manifestPath: path.relative(projectRoot, manifestPath),
    branch: git.branch,
    commit: git.commit,
    generatedAt: new Date().toISOString(),
    baseDir: projectRoot,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const reportBaseName = `uat-bug-report-${slug(projectId || 'project')}-${stamp}`;

  if (args.format === 'md' || args.format === 'both') {
    const md = generateMarkdownReport(sorted, reportOptions);
    const mdPath = path.join(effectiveOutDir, `${reportBaseName}.md`);
    fs.writeFileSync(mdPath, md, 'utf8');
    console.log(`Wrote Markdown report: ${mdPath}`);
  }

  if (args.format === 'json' || args.format === 'both') {
    const json = generateJsonReport(sorted, reportOptions);
    const jsonPath = path.join(effectiveOutDir, `${reportBaseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
    console.log(`Wrote JSON report: ${jsonPath}`);
  }

  if (args.ghExport) {
    const repo = args.ghRepo || reporting.gh_export?.repo || getDefaultRepo(projectRoot);
    const exportResults = exportBugs(sorted, {
      repo,
      outDir: effectiveOutDir,
      baseDir: projectRoot,
      force: args.forceGh,
      labels: reporting.gh_export?.labels || ['bug', 'uat'],
      assignees: reporting.gh_export?.assignees || [],
    });
    const exported = exportResults.filter((r) => r.exported).length;
    const skipped = exportResults.filter((r) => r.skipped).length;
    const errors = exportResults.filter((r) => r.error).length;
    console.log(`GitHub export: ${exported} created, ${skipped} skipped, ${errors} errors`);
    if (errors > 0) {
      for (const r of exportResults.filter((r) => r.error)) {
        console.error(`  - ${r.bug}: ${r.message}`);
      }
    }
  }

  const summary = {
    evidence_bundles: dirs.length,
    bugs_reported: sorted.length,
    by_severity: sorted.reduce((acc, b) => {
      acc[b.severity] = (acc[b.severity] || 0) + 1;
      return acc;
    }, {}),
  };

  if (args.pretty) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`net: ${summary.bugs_reported} bugs from ${summary.evidence_bundles} bundles`);
  }
}

function slug(value) {
  return String(value || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

main().catch((err) => {
  console.error(err?.message || String(err));
  process.exit(1);
});
