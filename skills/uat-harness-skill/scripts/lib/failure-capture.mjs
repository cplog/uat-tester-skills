#!/usr/bin/env node
/**
 * Failure evidence capture for Tier C UAT.
 *
 * Collects screenshot, DOM snapshot, console logs, network errors,
 * browser state, and metadata into a bundle under .uat/evidence/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SENSITIVE_KEY_RE = /token|secret|password|auth|key|credential|session|signature/i;
const DOM_CAP = 51200;

/**
 * Redact values for keys that look sensitive.
 */
export function sanitizeStorage(storage) {
  const out = {};
  for (const [k, v] of Object.entries(storage || {})) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '***REDACTED***';
    } else {
      out[k] = String(v).slice(0, 500);
    }
  }
  return out;
}

/**
 * Convert arbitrary text into a short filesystem-safe slug.
 */
export function slug(value) {
  return String(value || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

/**
 * Create a unique evidence directory for a failed check.
 */
export function ensureEvidenceDir(projectRoot, flowId, checkDescription) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const dir = path.join(
    projectRoot,
    '.uat',
    'evidence',
    `${timestamp}-${slug(flowId)}-${slug(checkDescription)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Best-effort git metadata. Silently returns empty strings outside git repos.
 */
export function getGitMeta(projectRoot) {
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

/**
 * Attach event listeners to a Playwright page and collect console logs,
 * network failures, and page errors.
 *
 * Returns an object with collected arrays and a capture() helper.
 */
export function createSessionTracker(page) {
  const consoleLogs = [];
  const networkErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
      timestamp: new Date().toISOString(),
    });
  });

  page.on('pageerror', (err) => {
    pageErrors.push({
      name: err.name,
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status >= 400) {
      networkErrors.push({
        url: res.url(),
        status,
        statusText: res.statusText(),
        method: res.request().method(),
        timestamp: new Date().toISOString(),
      });
    }
  });

  page.on('requestfailed', (req) => {
    networkErrors.push({
      url: req.url(),
      status: 0,
      statusText: req.failure()?.errorText || 'request failed',
      method: req.method(),
      timestamp: new Date().toISOString(),
    });
  });

  return {
    consoleLogs,
    networkErrors,
    pageErrors,
    capture: (options) =>
      captureFailure(page, {
        ...options,
        consoleLogs,
        networkErrors,
        pageErrors,
      }),
  };
}

/**
 * Capture a full evidence bundle for the current page state.
 *
 * Options:
 *   - projectRoot (default cwd)
 *   - dir (optional pre-computed evidence directory)
 *   - flowId, flowName, checkIndex, checkDescription
 *   - projectId, appUrl, manifestPath, tier
 *   - consoleLogs, networkErrors, pageErrors (arrays from tracker)
 */
export async function captureFailure(page, options = {}) {
  const {
    projectRoot = process.cwd(),
    dir,
    flowId = 'unknown',
    flowName = '',
    checkIndex = 0,
    checkDescription = 'unknown-check',
    projectId = '',
    appUrl = '',
    manifestPath = '',
    tier = 'C',
    flowCritical = false,
    consoleLogs = [],
    networkErrors = [],
    pageErrors = [],
  } = options;

  const evidenceDir = dir || ensureEvidenceDir(projectRoot, flowId, checkDescription);
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }
  const git = getGitMeta(projectRoot);

  const viewport = page.viewportSize() || { width: 0, height: 0 };
  const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => '');

  // Screenshot
  const screenshotPath = path.join(evidenceDir, 'screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // DOM snapshot (capped to avoid multi-MB files)
  const domPath = path.join(evidenceDir, 'dom.html');
  let dom = await page.content().catch(() => '<html></html>');
  const domTruncated = dom.length > DOM_CAP;
  if (domTruncated) {
    dom = dom.slice(0, DOM_CAP) + '\n<!-- truncated -->';
  }
  fs.writeFileSync(domPath, dom, 'utf8');

  // Browser state
  const state = await page.evaluate(() => ({
    url: window.location.href,
    cookies: document.cookie,
    localStorage: { ...window.localStorage },
    sessionStorage: { ...window.sessionStorage },
  })).catch(() => ({
    url: '',
    cookies: '',
    localStorage: {},
    sessionStorage: {},
  }));

  const cookies = state.cookies
    ? Object.fromEntries(
        state.cookies
          .split('; ')
          .map((c) => c.split('='))
          .filter(([k]) => k)
      )
    : {};

  const statePath = path.join(evidenceDir, 'browser-state.json');
  fs.writeFileSync(
    statePath,
    JSON.stringify(
      {
        url: state.url,
        viewport,
        userAgent,
        cookies: sanitizeStorage(cookies),
        localStorage: sanitizeStorage(state.localStorage),
        sessionStorage: sanitizeStorage(state.sessionStorage),
      },
      null,
      2
    )
  );

  // Console logs
  const consolePath = path.join(evidenceDir, 'console-logs.json');
  fs.writeFileSync(consolePath, JSON.stringify({ logs: consoleLogs, pageErrors }, null, 2));

  // Network errors (minimal HAR-like)
  const networkPath = path.join(evidenceDir, 'network-errors.json');
  fs.writeFileSync(networkPath, JSON.stringify({ errors: networkErrors }, null, 2));

  // Metadata
  const metadataPath = path.join(evidenceDir, 'metadata.json');
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        projectId,
        branch: git.branch,
        commit: git.commit,
        appUrl,
        manifestPath,
        tier,
        flowId,
        flowName,
        flowCritical,
        checkIndex,
        checkDescription,
        viewport,
        userAgent,
        evidenceDir,
      },
      null,
      2
    )
  );

  return {
    dir: evidenceDir,
    screenshot: screenshotPath,
    dom: domPath,
    browserState: statePath,
    consoleLogs: consolePath,
    networkErrors: networkPath,
    metadata: metadataPath,
    truncated: { dom: domTruncated },
  };
}

export default captureFailure;
