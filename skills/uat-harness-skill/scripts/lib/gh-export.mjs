#!/usr/bin/env node
/**
 * Export UAT bug reports to GitHub Issues.
 *
 * Requires the `gh` CLI to be installed and authenticated.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { generateMarkdownBug } from './generate-report.mjs';

const INDEX_FILE = '.exported.json';

function runGh(args, options = {}) {
  return spawnSync('gh', args, {
    encoding: 'utf8',
    timeout: 30000,
    ...options,
  });
}

export function isGhAvailable() {
  const r = runGh(['--version']);
  return r.status === 0;
}

export function isGhAuthenticated() {
  const r = runGh(['auth', 'status']);
  return r.status === 0;
}

export function getDefaultRepo(projectRoot) {
  try {
    const r = spawnSync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 5000,
    });
    const url = r.stdout.trim();
    if (!url) return null;
    // Handle https://github.com/owner/repo.git or git@github.com:owner/repo.git
    const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) return `${match[1]}/${match[2]}`;
  } catch {
    /* ignore */
  }
  return null;
}

function hashBug(bug) {
  const meta = bug.metadata || {};
  const payload = `${meta.projectId || ''}|${meta.flowId || ''}|${meta.checkIndex || 0}|${meta.checkDescription || ''}|${bug.title || ''}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function indexPath(outDir) {
  return path.join(outDir, INDEX_FILE);
}

export function loadExportedIndex(outDir) {
  const p = indexPath(outDir);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

export function saveExportedIndex(outDir, index) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(indexPath(outDir), JSON.stringify(index, null, 2));
}

function severityLabel(severity) {
  return `severity:${severity}`;
}

export function exportBugToGitHub(bug, options = {}) {
  const {
    repo,
    outDir,
    labels = ['bug', 'uat'],
    assignees = [],
    force = false,
    baseDir = process.cwd(),
  } = options;

  if (!repo) {
    throw new Error('GitHub repo is required (pass --gh-repo owner/repo or set a git remote origin)');
  }

  const id = hashBug(bug);
  const index = loadExportedIndex(outDir);
  if (!force && index[id]) {
    return { skipped: true, id, issueUrl: index[id].issueUrl };
  }

  const title = `[UAT][${bug.severity.toUpperCase()}] ${bug.title}`;
  const body = generateMarkdownBug(bug, { baseDir });
  const allLabels = Array.from(new Set([...labels, severityLabel(bug.severity)]));

  const args = ['issue', 'create', '--repo', repo, '--title', title, '--body', body];
  for (const label of allLabels) args.push('--label', label);
  for (const assignee of assignees) args.push('--assignee', assignee);

  const r = runGh(args);
  if (r.status !== 0) {
    throw new Error(`gh issue create failed: ${r.stderr || r.stdout}`);
  }

  const issueUrl = r.stdout.trim();
  index[id] = {
    issueUrl,
    exportedAt: new Date().toISOString(),
    title: bug.title,
    severity: bug.severity,
  };
  saveExportedIndex(outDir, index);

  return { exported: true, id, issueUrl };
}

export function exportBugs(bugs, options = {}) {
  if (!isGhAvailable()) {
    throw new Error('GitHub CLI (gh) is not installed. Install from https://cli.github.com/');
  }
  if (!isGhAuthenticated()) {
    throw new Error('GitHub CLI (gh) is not authenticated. Run: gh auth login');
  }

  const results = [];
  for (const bug of bugs) {
    try {
      results.push(exportBugToGitHub(bug, options));
    } catch (err) {
      results.push({ error: true, message: err.message, bug: bug.title });
    }
  }
  return results;
}

export default { exportBugToGitHub, exportBugs, isGhAvailable, isGhAuthenticated, getDefaultRepo };
