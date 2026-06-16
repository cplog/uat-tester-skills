#!/usr/bin/env node
/**
 * Discover frontend routes, API endpoints, and npm scripts in a consumer repo.
 * Used by init (draft) and audit (coverage gaps).
 *
 * Usage:
 *   node discover.mjs [--json|--pretty] [projectRoot]
 *   node discover.mjs --draft [projectRoot]   # suggested manifest snippets
 *
 * Env:
 *   UAT_DISCOVER_PATHS — space-separated extra roots (e.g. sibling backend repo)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
]);

const UI_PAGE_GLOBS = [
  /^app\/(.+)\/page\.(tsx|jsx|ts|js)$/,
  /^pages\/(.+)\.(tsx|jsx|ts|js)$/,
  /^src\/pages\/(.+)\.(tsx|jsx|ts|js)$/,
  /^src\/routes\/(.+)\.(tsx|jsx|ts|js)$/,
];

const API_ROUTE_PATTERNS = [
  /^app\/api\/(.+)\/route\.(ts|js)$/,
  /^pages\/api\/(.+)\.(ts|js)$/,
  /^src\/pages\/api\/(.+)\.(ts|js)$/,
];

function walkFiles(root, maxDepth = 8, depth = 0, files = []) {
  if (depth > maxDepth || !fs.existsSync(root)) return files;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const abs = path.join(root, ent.name);
    if (ent.isDirectory()) {
      walkFiles(abs, maxDepth, depth + 1, files);
    } else if (ent.isFile()) {
      files.push(abs);
    }
  }
  return files;
}

function toRouteFromAppSegment(seg) {
  const parts = seg.split('/').filter(Boolean);
  if (parts[parts.length - 1] === 'page') parts.pop();
  let route = `/${parts.join('/')}`;
  route = route.replace(/\/\[[^\]]+\]/g, '/:param');
  if (route === '/') return '/';
  return route.replace(/\/+/g, '/');
}

function toApiRouteFromSegment(seg) {
  const clean = seg.replace(/\/route$/, '').replace(/\/index$/, '');
  return `/api/${clean}`.replace(/\/+/g, '/');
}

function discoverUiRoutes(projectRoot) {
  const routes = new Map();
  const files = walkFiles(projectRoot);
  for (const abs of files) {
    const rel = path.relative(projectRoot, abs).replace(/\\/g, '/');
    for (const re of UI_PAGE_GLOBS) {
      const m = rel.match(re);
      if (!m) continue;
      const seg = m[1] || '';
      const route = seg ? toRouteFromAppSegment(seg) : '/';
      const id = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-').replace(/:param/g, 'param');
      routes.set(route, {
        id: id || 'page',
        path: route,
        source: rel,
        kind: 'ui',
      });
    }
  }
  return [...routes.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function discoverApiRoutesFromFiles(projectRoot) {
  const routes = new Map();
  const files = walkFiles(projectRoot);
  for (const abs of files) {
    const rel = path.relative(projectRoot, abs).replace(/\\/g, '/');
    for (const re of API_ROUTE_PATTERNS) {
      const m = rel.match(re);
      if (!m) continue;
      const route = toApiRouteFromSegment(m[1] || '');
      const id = route.replace(/^\/api\//, '').replace(/\//g, '-') || 'api-root';
      routes.set(route, { id: `api-${id}`, path: route, source: rel, kind: 'api' });
    }
  }
  return [...routes.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function discoverFastApiRoutes(projectRoot) {
  const routes = new Map();
  const files = walkFiles(projectRoot).filter((f) => f.endsWith('.py'));
  const re = /@(?:app|router)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
  for (const abs of files) {
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (!text.includes('@app.') && !text.includes('@router.')) continue;
    let m;
    while ((m = re.exec(text)) !== null) {
      const method = m[1].toUpperCase();
      const routePath = m[2];
      const key = `${method} ${routePath}`;
      routes.set(key, {
        id: `api-${routePath.replace(/^\//, '').replace(/\//g, '-') || 'root'}`,
        path: routePath,
        method,
        source: path.relative(projectRoot, abs),
        kind: 'api',
      });
    }
  }
  return [...routes.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function discoverOpenApi(projectRoot) {
  const candidates = ['openapi.json', 'openapi.yaml', 'openapi.yml', 'docs/openapi.json'];
  for (const rel of candidates) {
    const abs = path.join(projectRoot, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const text = fs.readFileSync(abs, 'utf8');
      if (rel.endsWith('.json')) {
        const doc = JSON.parse(text);
        return extractOpenApiPaths(doc, rel);
      }
      return extractOpenApiPathsFromYaml(text, rel);
    } catch {
      continue;
    }
  }
  return [];
}

function extractOpenApiPaths(doc, source) {
  const out = [];
  const paths = doc.paths || {};
  for (const [routePath, methods] of Object.entries(paths)) {
    for (const method of Object.keys(methods)) {
      if (method.startsWith('x-') || method === 'parameters') continue;
      out.push({
        id: `api-${routePath.replace(/^\//, '').replace(/\//g, '-') || 'root'}`,
        path: routePath,
        method: method.toUpperCase(),
        source,
        kind: 'api',
      });
    }
  }
  return out;
}

function extractOpenApiPathsFromYaml(text, source) {
  const out = [];
  let currentPath = null;
  for (const raw of text.split('\n')) {
    const pathMatch = raw.match(/^(\s{0,2})\/[^\s:]+:/);
    if (pathMatch) {
      currentPath = raw.trim().replace(/:$/, '');
      continue;
    }
    const methodMatch = raw.match(/^\s+(get|post|put|patch|delete):/i);
    if (currentPath && methodMatch) {
      out.push({
        id: `api-${currentPath.replace(/^\//, '').replace(/\//g, '-') || 'root'}`,
        path: currentPath,
        method: methodMatch[1].toUpperCase(),
        source,
        kind: 'api',
      });
    }
  }
  return out;
}

function discoverPackageScripts(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return { static: [], smoke: [], worker: [] };
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return { static: [], smoke: [], worker: [] };
  }
  const scripts = pkg.scripts || {};
  const staticCandidates = [];
  const smokeCandidates = [];
  const workerCandidates = [];
  for (const [name, cmd] of Object.entries(scripts)) {
    const n = name.toLowerCase();
    if (['lint', 'typecheck', 'type-check', 'build', 'test:unit', 'test'].includes(n)) {
      staticCandidates.push(`npm run ${name}`);
    }
    if (/smoke|health|verify|e2e|integration/.test(n)) {
      smokeCandidates.push(`npm run ${name}`);
    }
    if (/worker|cron|queue|job|celery/.test(n)) {
      workerCandidates.push(`npm run ${name}`);
    }
  }
  return { static: staticCandidates, smoke: smokeCandidates, worker: workerCandidates };
}

function mergeApiRoutes(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const r of list) {
      const key = r.method ? `${r.method} ${r.path}` : r.path;
      if (!map.has(key)) map.set(key, r);
    }
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function discoverInlineServerRoutes(projectRoot) {
  const uiRoutes = [];
  const apiRoutes = [];
  const candidates = ['server.mjs', 'server.js', 'index.mjs', 'index.js', 'app.mjs'];
  for (const name of candidates) {
    const abs = path.join(projectRoot, name);
    if (!fs.existsSync(abs)) continue;
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const pagesBlock = text.match(/(?:const|let)\s+pages\s*=\s*\{([^}]+)\}/s);
    if (pagesBlock) {
      const keys = pagesBlock[1].matchAll(/['"](\/[^'"]*)['"]\s*:/g);
      for (const m of keys) {
        const route = m[1];
        const id = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-');
        uiRoutes.push({ id, path: route, source: name, kind: 'ui' });
      }
    }
    for (const m of text.matchAll(/path\s*===?\s*['"](\/[^'"]+)['"]/g)) {
      const route = m[1];
      if (route.startsWith('/api')) {
        apiRoutes.push({
          id: `api-${route.replace(/^\/api\//, '').replace(/\//g, '-')}`,
          path: route,
          method: 'GET',
          source: name,
          kind: 'api',
        });
      } else if (!uiRoutes.some((r) => r.path === route)) {
        const id = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-');
        uiRoutes.push({ id, path: route, source: name, kind: 'ui' });
      }
    }
  }
  return { uiRoutes, apiRoutes };
}

export function discoverProject(projectRoot) {
  const fromFiles = discoverUiRoutes(projectRoot);
  const inline = discoverInlineServerRoutes(projectRoot);
  const uiMap = new Map();
  for (const r of [...fromFiles, ...inline.uiRoutes]) {
    uiMap.set(r.path, r);
  }
  const uiRoutes = [...uiMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  const apiRoutes = mergeApiRoutes(
    discoverApiRoutesFromFiles(projectRoot),
    discoverFastApiRoutes(projectRoot),
    discoverOpenApi(projectRoot),
    inline.apiRoutes
  );
  const scripts = discoverPackageScripts(projectRoot);
  let framework = 'unknown';
  if (fs.existsSync(path.join(projectRoot, 'next.config.js')) || fs.existsSync(path.join(projectRoot, 'next.config.mjs'))) {
    framework = 'nextjs';
  } else if (fs.existsSync(path.join(projectRoot, 'vite.config.ts')) || fs.existsSync(path.join(projectRoot, 'vite.config.js'))) {
    framework = 'vite';
  } else if (apiRoutes.some((r) => r.source?.endsWith('.py'))) {
    framework = 'fastapi';
  }

  return {
    root: projectRoot,
    framework,
    uiRoutes,
    apiRoutes,
    scripts,
  };
}

function linkedRepoPaths(primaryRoot) {
  const manifestPath = path.join(primaryRoot, 'uat-manifest.yml');
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const text = fs.readFileSync(manifestPath, 'utf8');
    const paths = [];
    let inLinked = false;
    for (const raw of text.split('\n')) {
      const line = raw.replace(/\s*#.*$/, '');
      if (line.trim() === 'linked_repos:') {
        inLinked = true;
        continue;
      }
      if (inLinked && /^\w/.test(line.trim()) && !line.startsWith(' ')) {
        inLinked = false;
      }
      const pathMatch = line.match(/^\s+path:\s*(.+)/);
      if (inLinked && pathMatch) {
        const p = pathMatch[1].trim();
        paths.push(path.isAbsolute(p) ? p : path.resolve(primaryRoot, p));
      }
    }
    return paths;
  } catch {
    return [];
  }
}

export function discoverAll(primaryRoot) {
  const fromEnv = (process.env.UAT_DISCOVER_PATHS || '')
    .split(/[\s:,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => (path.isAbsolute(p) ? p : path.resolve(primaryRoot, p)));

  const fromManifest = linkedRepoPaths(primaryRoot);
  const extra = [...fromEnv, ...fromManifest];
  const roots = [primaryRoot, ...extra.filter((p) => p !== primaryRoot && fs.existsSync(p))];
  const projects = roots.map((r) => discoverProject(r));
  return {
    primary: primaryRoot,
    projects,
    uiRoutes: projects.flatMap((p) => p.uiRoutes.map((r) => ({ ...r, project: path.basename(p.root) }))),
    apiRoutes: projects.flatMap((p) => p.apiRoutes.map((r) => ({ ...r, project: path.basename(p.root) }))),
    scripts: projects[0]?.scripts || { static: [], smoke: [], worker: [] },
  };
}

function suggestFlow(route) {
  const id = route.id.replace(/^api-/, '') || 'flow';
  const checks =
    route.kind === 'api'
      ? [`${route.method || 'GET'} ${route.path} returns expected status`]
      : ['page loads without error', 'primary content visible', 'navigation works'];
  return {
    id,
    name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    path: [route.path],
    critical: route.path === '/' || route.kind === 'api',
    checks,
    _source: route.source,
    _kind: route.kind,
  };
}

export function draftSuggestions(discovery) {
  const flows = discovery.uiRoutes.map(suggestFlow);
  const apiFlows = discovery.apiRoutes
    .filter((r) => !r.path.includes(':param'))
    .slice(0, 20)
    .map((r) => suggestFlow(r));

  const smoke = [...discovery.scripts.smoke];
  if (discovery.apiRoutes.length && !smoke.length) {
    const health = discovery.apiRoutes.find((r) => /health/i.test(r.path));
    const probe = health?.path || discovery.apiRoutes[0]?.path;
    if (probe) {
      smoke.push(
        `node -e "fetch(process.env.UAT_URL+'${probe}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`
      );
    }
  }

  return {
    flows: [...flows, ...apiFlows],
    tiers: {
      static: discovery.scripts.static.slice(0, 4),
      smoke: smoke.slice(0, 4),
      worker: discovery.scripts.worker.slice(0, 4),
    },
    linked_repos: discovery.projects.slice(1).map((p) => ({
      id: path.basename(p.root),
      path: p.root,
    })),
  };
}

function printPretty(discovery) {
  console.log(`# UAT discovery — ${discovery.primary}`);
  console.log('');
  console.log(`## UI routes (${discovery.uiRoutes.length})`);
  for (const r of discovery.uiRoutes.slice(0, 40)) {
    console.log(`- ${r.path}${r.project ? ` [${r.project}]` : ''} ← ${r.source}`);
  }
  if (discovery.uiRoutes.length > 40) console.log(`- … and ${discovery.uiRoutes.length - 40} more`);
  console.log('');
  console.log(`## API routes (${discovery.apiRoutes.length})`);
  for (const r of discovery.apiRoutes.slice(0, 40)) {
    const method = r.method ? `${r.method} ` : '';
    console.log(`- ${method}${r.path}${r.project ? ` [${r.project}]` : ''} ← ${r.source}`);
  }
  if (discovery.apiRoutes.length > 40) console.log(`- … and ${discovery.apiRoutes.length - 40} more`);
  console.log('');
  console.log('## Suggested tier scripts');
  console.log(`- static: ${discovery.scripts.static.join(', ') || '(none)'}`);
  console.log(`- smoke: ${discovery.scripts.smoke.join(', ') || '(none)'}`);
  console.log(`- worker: ${discovery.scripts.worker.join(', ') || '(none)'}`);
}

function printDraft(discovery) {
  const draft = draftSuggestions(discovery);
  console.log('# Suggested uat-manifest.yml snippets (review before committing)');
  console.log('');
  console.log('flows:');
  for (const f of draft.flows.slice(0, 15)) {
    console.log(`  - id: ${f.id}`);
    console.log(`    name: ${f.name}`);
    console.log(`    path: [${f.path.join(', ')}]`);
    if (f.critical) console.log('    critical: true');
    console.log('    checks:');
    for (const c of f.checks) console.log(`      - ${c}`);
  }
  if (draft.flows.length > 15) console.log(`  # … ${draft.flows.length - 15} more flows from discovery`);
  console.log('');
  console.log('tiers:');
  console.log('  static:');
  for (const c of draft.tiers.static) console.log(`    - ${c}`);
  console.log('  smoke:');
  for (const c of draft.tiers.smoke) console.log(`    - ${c}`);
  if (draft.tiers.worker.length) {
    console.log('  worker:');
    for (const c of draft.tiers.worker) console.log(`    - ${c}`);
  }
  if (draft.linked_repos.length) {
    console.log('');
    console.log('linked_repos:');
    for (const lr of draft.linked_repos) {
      console.log(`  - id: ${lr.id}`);
      console.log(`    path: ${lr.path}`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const pretty = args.includes('--pretty') || args.includes('--draft');
  const draft = args.includes('--draft');
  const rootArg = args.find((a) => !a.startsWith('--')) || process.cwd();
  const root = path.resolve(rootArg);

  const discovery = discoverAll(root);
  if (draft) {
    printDraft(discovery);
    return;
  }
  if (json) {
    console.log(JSON.stringify(discovery, null, 2));
    return;
  }
  printPretty(discovery);
}

const invoked =
  process.argv[1] &&
  fs.existsSync(process.argv[1]) &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));

if (invoked) {
  main();
}
