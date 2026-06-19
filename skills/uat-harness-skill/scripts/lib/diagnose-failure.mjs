#!/usr/bin/env node
/**
 * Diagnose a UAT failure from an evidence bundle.
 *
 * Usage:
 *   node diagnose-failure.mjs <evidence-dir> [--pretty]
 *
 * If ANTHROPIC_API_KEY is set, the script calls Claude with vision and
 * returns a structured diagnosis. Otherwise it returns a heuristic fallback
 * diagnosis plus a prompt that a parent agent can use to dispatch a subagent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

function parseArgs(argv) {
  const out = { dir: '', pretty: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pretty') out.pretty = true;
    else if (!a.startsWith('--') && !out.dir) out.dir = a;
  }
  return out;
}

export function loadEvidenceBundle(dir) {
  const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8'));
  const consoleData = JSON.parse(fs.readFileSync(path.join(dir, 'console-logs.json'), 'utf8'));
  const networkData = JSON.parse(fs.readFileSync(path.join(dir, 'network-errors.json'), 'utf8'));
  const browserState = JSON.parse(fs.readFileSync(path.join(dir, 'browser-state.json'), 'utf8'));
  const screenshotPath = path.join(dir, 'screenshot.png');
  const domPath = path.join(dir, 'dom.html');

  return {
    dir,
    metadata,
    consoleLogs: consoleData.logs || [],
    pageErrors: consoleData.pageErrors || [],
    networkErrors: networkData.errors || [],
    browserState,
    screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : null,
    dom: fs.existsSync(domPath) ? fs.readFileSync(domPath, 'utf8') : '',
  };
}

function summarizeConsole(bundle) {
  const errors = bundle.consoleLogs.filter((l) => l.type === 'error');
  const warnings = bundle.consoleLogs.filter((l) => l.type === 'warning');
  return {
    total: bundle.consoleLogs.length,
    errors: errors.map((l) => l.text).slice(0, 20),
    warnings: warnings.map((l) => l.text).slice(0, 10),
    pageErrors: bundle.pageErrors.map((e) => e.message).slice(0, 10),
  };
}

function summarizeNetwork(bundle) {
  return bundle.networkErrors.slice(0, 20).map((e) => ({
    url: e.url,
    status: e.status,
    statusText: e.statusText,
    method: e.method,
  }));
}

function buildPrompt(bundle) {
  const { metadata, browserState } = bundle;
  const consoleSummary = summarizeConsole(bundle);
  const networkSummary = summarizeNetwork(bundle);

  return `You are a senior QA engineer analyzing a failed User Acceptance Testing (UAT) check.

FAILED CHECK:
- Project: ${metadata.projectId || 'unknown'}
- Flow: ${metadata.flowId}${metadata.flowName ? ` (${metadata.flowName})` : ''}
- Check #${metadata.checkIndex}: ${metadata.checkDescription}
- URL: ${browserState.url || metadata.appUrl || 'unknown'}
- Viewport: ${JSON.stringify(browserState.viewport || metadata.viewport)}
- Branch: ${metadata.branch || 'unknown'}
- Commit: ${metadata.commit || 'unknown'}
- Flow marked critical: ${metadata.flowCritical ? 'yes' : 'no'}

EVIDENCE SUMMARY:
- Console errors (${consoleSummary.errors.length}): ${consoleSummary.errors.join('; ') || 'none'}
- Page errors (${consoleSummary.pageErrors.length}): ${consoleSummary.pageErrors.join('; ') || 'none'}
- Network failures (${networkSummary.length}): ${networkSummary.map((e) => `${e.method} ${e.url} -> ${e.status} ${e.statusText}`).join('; ') || 'none'}

DOM EXCERPT (truncated):
${bundle.dom.slice(0, 2000)}

Analyze the attached screenshot and the evidence above. Produce a structured JSON object with exactly these keys:
{
  "title": "concise bug title",
  "severity": "critical|high|medium|low|info",
  "rootCause": "most likely root cause in plain language",
  "responsibleArea": "frontend|backend|infra|test|unknown — be specific where possible",
  "reproSteps": ["step 1", "step 2", "..."],
  "suggestedFixes": ["fix 1", "fix 2", "..."],
  "confidence": 0.0-1.0
}

Severity guidance:
- critical: page crash, total blocker, or critical flow completely broken
- high: important functionality broken or critical flow partially broken
- medium: non-critical functionality broken
- low: cosmetic or minor UX issue
- info: observation, not a defect

Return ONLY valid JSON. Do not wrap it in markdown.`;
}

async function callAnthropic(textPrompt, imageBase64) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.UAT_DIAGNOSIS_MODEL || DEFAULT_MODEL;
  const content = imageBase64
    ? [
        { type: 'text', text: textPrompt },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: imageBase64 },
        },
      ]
    : [{ type: 'text', text: textPrompt }];

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseDiagnosis(text) {
  const cleaned = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract the first JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Model response was not valid JSON');
  }
}

function inferSeverity(bundle) {
  const hasCrash = bundle.pageErrors.length > 0 || bundle.consoleLogs.some((l) => /uncaught|crash|fatal/i.test(l.text));
  const has5xx = bundle.networkErrors.some((e) => e.status >= 500);
  if (bundle.metadata.flowCritical && (hasCrash || has5xx)) return 'critical';
  if (bundle.metadata.flowCritical) return 'high';
  if (hasCrash || has5xx) return 'high';
  if (bundle.networkErrors.length > 0 || bundle.consoleLogs.some((l) => l.type === 'error')) return 'medium';
  return 'low';
}

function inferArea(bundle) {
  if (bundle.networkErrors.some((e) => e.status >= 500)) return 'backend';
  if (bundle.networkErrors.some((e) => e.status >= 400)) return 'backend/api';
  if (bundle.pageErrors.length > 0 || bundle.consoleLogs.some((l) => l.type === 'error')) return 'frontend';
  return 'frontend/ui';
}

export function fallbackDiagnosis(bundle) {
  const severity = inferSeverity(bundle);
  const area = inferArea(bundle);
  const consoleTexts = summarizeConsole(bundle);
  const networkTexts = summarizeNetwork(bundle);

  return {
    title: `${bundle.metadata.flowId}: ${bundle.metadata.checkDescription} failed`,
    severity,
    rootCause: `Automated heuristic only (no ANTHROPIC_API_KEY). ${
      networkTexts.length > 0
        ? `Network errors detected (${networkTexts.length}).`
        : consoleTexts.errors.length > 0 || consoleTexts.pageErrors.length > 0
        ? `Console/page errors detected.`
        : `Check did not pass; inspect screenshot and DOM for visual/state mismatch.`
    }`,
    responsibleArea: area,
    reproSteps: [
      `Navigate to ${bundle.browserState.url || bundle.metadata.appUrl || 'the app URL'}`,
      `Run the "${bundle.metadata.checkDescription}" check in flow "${bundle.metadata.flowId}"`,
      `Observe the failure (see screenshot and DOM in ${bundle.dir})`,
    ],
    suggestedFixes: [
      'Inspect the screenshot and DOM snapshot in the evidence directory.',
      networkTexts.length > 0
        ? 'Investigate failing network requests and backend/API responses.'
        : 'Check frontend rendering, selectors, and recent changes in the diff.',
      'Re-run the check after applying a fix.',
    ],
    confidence: 0.3,
    fallback: true,
  };
}

export async function runDiagnosis(dir, options = {}) {
  const bundle = loadEvidenceBundle(dir);
  const prompt = buildPrompt(bundle);

  let imageBase64 = null;
  if (bundle.screenshotPath) {
    imageBase64 = fs.readFileSync(bundle.screenshotPath).toString('base64');
  }

  const raw = await callAnthropic(prompt, imageBase64);

  if (raw) {
    const diagnosis = parseDiagnosis(raw);
    return {
      ...diagnosis,
      evidenceDir: dir,
      screenshotPath: bundle.screenshotPath,
      metadata: bundle.metadata,
      model: process.env.UAT_DIAGNOSIS_MODEL || DEFAULT_MODEL,
    };
  }

  return {
    ...fallbackDiagnosis(bundle),
    evidenceDir: dir,
    screenshotPath: bundle.screenshotPath,
    metadata: bundle.metadata,
    prompt,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.dir || !fs.existsSync(args.dir)) {
    console.error('Usage: diagnose-failure.mjs <evidence-dir> [--pretty]');
    process.exit(1);
  }

  const result = await runDiagnosis(path.resolve(args.dir));
  if (args.pretty) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(JSON.stringify(result));
  }
}

const isMain = process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err?.message || String(err));
    process.exit(1);
  });
}
