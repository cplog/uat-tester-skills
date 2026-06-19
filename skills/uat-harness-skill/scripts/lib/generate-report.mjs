#!/usr/bin/env node
/**
 * Generate human-readable and machine-readable UAT bug reports from
 * structured bug objects produced by diagnose-failure.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';

function severityRank(sev) {
  const map = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  return map[sev] || 0;
}

export function sortBugs(bugs) {
  return [...bugs].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function generateSummary(bugs) {
  const total = bugs.length;
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, unknown: 0 };
  for (const b of bugs) {
    counts[b.severity] = (counts[b.severity] || 0) + 1;
  }
  return { total, ...counts };
}

function relativePath(absolutePath, baseDir) {
  if (!absolutePath) return '';
  const rel = path.relative(baseDir, absolutePath);
  return rel.startsWith('..') ? absolutePath : rel;
}

export function generateMarkdownBug(bug, options = {}) {
  const { baseDir = process.cwd() } = options;
  const meta = bug.metadata || {};
  const lines = [];

  lines.push(`## Severity: ${bug.severity.toUpperCase()}`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Flow** | ${meta.flowId || ''}${meta.flowName ? ` (${meta.flowName})` : ''} |`);
  lines.push(`| **Check** | ${meta.checkDescription || ''} |`);
  lines.push(`| **Confidence** | ${typeof bug.confidence === 'number' ? `${Math.round(bug.confidence * 100)}%` : bug.confidence || 'n/a'} |`);
  lines.push(`| **Area** | ${bug.responsibleArea || 'unknown'} |`);
  lines.push('');

  if (bug.rootCause) {
    lines.push('### Root Cause');
    lines.push('');
    lines.push(bug.rootCause);
    lines.push('');
  }

  if (Array.isArray(bug.reproSteps) && bug.reproSteps.length > 0) {
    lines.push('### Reproduction Steps');
    lines.push('');
    bug.reproSteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    lines.push('');
  }

  if (Array.isArray(bug.suggestedFixes) && bug.suggestedFixes.length > 0) {
    lines.push('### Suggested Fixes');
    lines.push('');
    bug.suggestedFixes.forEach((fix) => lines.push(`- ${fix}`));
    lines.push('');
  }

  lines.push('### Evidence');
  lines.push('');
  if (bug.screenshotPath) {
    const rel = relativePath(bug.screenshotPath, baseDir);
    lines.push(`- Screenshot: \`${rel}\``);
  }
  if (bug.evidenceDir) {
    const rel = relativePath(bug.evidenceDir, baseDir);
    lines.push(`- Evidence bundle: \`${rel}\``);
  }
  lines.push('');

  return lines.join('\n');
}

export function generateMarkdownReport(bugs, options = {}) {
  const {
    projectId = '',
    branch = '',
    commit = '',
    appUrl = '',
    manifestPath = '',
    generatedAt = new Date().toISOString(),
    baseDir = process.cwd(),
  } = options;

  const sorted = sortBugs(bugs);
  const summary = generateSummary(sorted);

  const lines = [];
  lines.push(`# UAT Bug Report — ${projectId || 'unknown project'}`);
  lines.push('');
  lines.push(`**Generated:** ${generatedAt}`);
  if (appUrl) lines.push(`**App URL:** ${appUrl}`);
  if (manifestPath) lines.push(`**Manifest:** ${manifestPath}`);
  if (branch) lines.push(`**Branch:** ${branch}`);
  if (commit) lines.push(`**Commit:** ${commit}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total failures | ${summary.total} |`);
  lines.push(`| Critical | ${summary.critical} |`);
  lines.push(`| High | ${summary.high} |`);
  lines.push(`| Medium | ${summary.medium} |`);
  lines.push(`| Low | ${summary.low} |`);
  lines.push(`| Info | ${summary.info} |`);
  lines.push('');

  if (sorted.length === 0) {
    lines.push('No failures found. 🎉');
    lines.push('');
    return lines.join('\n');
  }

  sorted.forEach((bug, idx) => {
    const meta = bug.metadata || {};
    lines.push(`---`);
    lines.push('');
    lines.push(`## Bug ${idx + 1}: [${bug.severity.toUpperCase()}] ${bug.title}`);
    lines.push('');
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| **Flow** | ${meta.flowId || ''}${meta.flowName ? ` (${meta.flowName})` : ''} |`);
    lines.push(`| **Check** | ${meta.checkDescription || ''} |`);
    lines.push(`| **Severity** | ${bug.severity} |`);
    lines.push(`| **Confidence** | ${typeof bug.confidence === 'number' ? `${Math.round(bug.confidence * 100)}%` : bug.confidence || 'n/a'} |`);
    lines.push(`| **Area** | ${bug.responsibleArea || 'unknown'} |`);
    lines.push('');

    if (bug.rootCause) {
      lines.push('### Root Cause');
      lines.push('');
      lines.push(bug.rootCause);
      lines.push('');
    }

    if (Array.isArray(bug.reproSteps) && bug.reproSteps.length > 0) {
      lines.push('### Reproduction Steps');
      lines.push('');
      bug.reproSteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
      lines.push('');
    }

    if (Array.isArray(bug.suggestedFixes) && bug.suggestedFixes.length > 0) {
      lines.push('### Suggested Fixes');
      lines.push('');
      bug.suggestedFixes.forEach((fix) => lines.push(`- ${fix}`));
      lines.push('');
    }

    lines.push('### Evidence');
    lines.push('');
    if (bug.screenshotPath) {
      const rel = relativePath(bug.screenshotPath, baseDir);
      lines.push(`- Screenshot: \`${rel}\``);
    }
    if (bug.evidenceDir) {
      const rel = relativePath(bug.evidenceDir, baseDir);
      lines.push(`- Evidence bundle: \`${rel}\``);
    }
    lines.push('');
  });

  lines.push('---');
  lines.push('');
  lines.push('## Follow-ups');
  lines.push('');
  lines.push('- [ ] Address critical/high severity bugs first.');
  lines.push('- [ ] Update manifest checks if the failure was due to changed requirements.');
  lines.push('- [ ] Add regression tests for fixed issues.');
  lines.push('');

  return lines.join('\n');
}

export function generateJsonReport(bugs, options = {}) {
  const {
    projectId = '',
    branch = '',
    commit = '',
    appUrl = '',
    manifestPath = '',
    generatedAt = new Date().toISOString(),
  } = options;

  const sorted = sortBugs(bugs);
  const summary = generateSummary(sorted);

  return {
    report_version: '1.0.0',
    generated_at: generatedAt,
    project_id: projectId,
    branch,
    commit,
    app_url: appUrl,
    manifest_path: manifestPath,
    summary: {
      total_failures: summary.total,
      critical: summary.critical,
      high: summary.high,
      medium: summary.medium,
      low: summary.low,
      info: summary.info,
    },
    bugs: sorted.map((bug, idx) => ({
      id: `bug-${idx + 1}`,
      title: bug.title,
      severity: bug.severity,
      confidence: bug.confidence,
      responsible_area: bug.responsibleArea,
      root_cause: bug.rootCause,
      repro_steps: bug.reproSteps || [],
      suggested_fixes: bug.suggestedFixes || [],
      flow_id: bug.metadata?.flowId,
      flow_name: bug.metadata?.flowName,
      flow_critical: bug.metadata?.flowCritical,
      check_index: bug.metadata?.checkIndex,
      check_description: bug.metadata?.checkDescription,
      evidence_dir: bug.evidenceDir,
      screenshot_path: bug.screenshotPath,
      fallback: bug.fallback || false,
      model: bug.model || null,
    })),
  };
}

export default { generateMarkdownReport, generateJsonReport, generateSummary, sortBugs };
