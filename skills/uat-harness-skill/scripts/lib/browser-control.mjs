#!/usr/bin/env node
/**
 * Minimal Playwright CDP helper for Tier C subagents.
 * Requires playwright or playwright-core in the consumer project (optional devDependency).
 *
 * Usage:
 *   node browser-control.mjs ping
 *   node browser-control.mjs navigate <url>
 *   node browser-control.mjs click <selector>
 *   node browser-control.mjs text <selector>
 *   node browser-control.mjs screenshot <path>
 *   node browser-control.mjs url
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { captureFailure, createSessionTracker } from './failure-capture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const CDP_URL = process.env.UAT_CDP_URL || 'http://127.0.0.1:9222';

function resolvePlaywright() {
  const roots = [
    process.cwd(),
    path.resolve(__dirname, '../../../../..'),
    path.resolve(__dirname, '../../../../../cli'),
    path.resolve(__dirname, '../../../../'),
    path.resolve(__dirname, '../../../../cli'),
  ];
  for (const root of roots) {
    for (const pkg of ['playwright-core', 'playwright']) {
      const candidate = path.join(root, 'node_modules', pkg);
      if (fs.existsSync(candidate)) {
        return require(candidate);
      }
    }
  }
  return null;
}

async function getPage() {
  const pw = resolvePlaywright();
  if (!pw) {
    console.error(
      'playwright or playwright-core not found. Install in the consumer project:\n  npm install -D playwright'
    );
    process.exit(1);
  }
  const browser = await pw.chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());
  return { browser, page };
}

async function ping() {
  const res = await fetch(`${CDP_URL}/json/version`);
  if (!res.ok) {
    console.error(`CDP unreachable: ${CDP_URL} (HTTP ${res.status})`);
    process.exit(1);
  }
  const info = await res.json();
  console.log(JSON.stringify({ ok: true, cdp: CDP_URL, browser: info.Browser || info.browser }));
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(`Usage: browser-control.mjs <ping|navigate|click|text|screenshot|url|capture> [arg]`);
    console.log(`  capture <out-dir>   Capture a full failure evidence bundle (screenshot, DOM, logs, state)`);
    process.exit(0);
  }

  if (cmd === 'ping') {
    await ping();
    return;
  }

  const { browser, page } = await getPage();
  try {
    switch (cmd) {
      case 'navigate':
        if (!arg) throw new Error('navigate requires a URL');
        await page.goto(arg, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log(JSON.stringify({ ok: true, url: page.url() }));
        break;
      case 'click':
        if (!arg) throw new Error('click requires a selector');
        await page.click(arg, { timeout: 15000 });
        console.log(JSON.stringify({ ok: true, action: 'click', selector: arg }));
        break;
      case 'text':
        if (!arg) throw new Error('text requires a selector');
        {
          const text = await page.locator(arg).first().innerText({ timeout: 15000 });
          console.log(JSON.stringify({ ok: true, selector: arg, text: text.trim() }));
        }
        break;
      case 'screenshot':
        if (!arg) throw new Error('screenshot requires an output path');
        await page.screenshot({ path: arg, fullPage: true });
        console.log(JSON.stringify({ ok: true, path: path.resolve(arg) }));
        break;
      case 'url':
        console.log(JSON.stringify({ ok: true, url: page.url() }));
        break;
      case 'capture': {
        if (!arg) throw new Error('capture requires an output directory');
        const tracker = createSessionTracker(page);
        const bundle = await tracker.capture({
          dir: path.resolve(arg),
          flowId: process.env.UAT_FLOW_ID,
          flowName: process.env.UAT_FLOW_NAME,
          checkIndex: Number(process.env.UAT_CHECK_INDEX || 0),
          checkDescription: process.env.UAT_CHECK_DESCRIPTION,
          projectId: process.env.UAT_PROJECT_ID,
          appUrl: process.env.UAT_APP_URL,
          manifestPath: process.env.UAT_MANIFEST_PATH,
          tier: process.env.UAT_TIER || 'C',
          flowCritical: process.env.UAT_FLOW_CRITICAL === 'true',
        });
        console.log(JSON.stringify({ ok: true, bundle }));
        break;
      }
      default:
        console.error(`Unknown command: ${cmd}`);
        process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
