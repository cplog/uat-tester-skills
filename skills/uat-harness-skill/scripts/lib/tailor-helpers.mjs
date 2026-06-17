/**
 * Cluster discovered UI routes into operator-level flow groups for agent tailoring.
 */
import fs from 'node:fs';
import path from 'node:path';

export function normalizeRoute(p) {
  return (p || '/').replace(/\/+$/, '') || '/';
}

/** First segment(s) that identify a product module (not dynamic :param). */
function moduleKey(routePath) {
  const norm = normalizeRoute(routePath);
  const segs = norm.split('/').filter(Boolean).filter((s) => !s.startsWith(':'));
  if (!segs.length) return 'home';
  if (segs[0] === 'helloboss' && segs.length >= 2) {
    if (segs[1] === 'settings') return 'settings';
    if (segs[1] === 'concierge') return 'concierge';
    if (segs[1] === 'schedule') return 'schedule';
    if (segs[1] === 'marketing') return 'marketing';
    if (segs[1] === 'channels') return 'channels';
    return segs[1];
  }
  if (segs[0] === 'api' || segs[0] === 'api-docs') return segs[0];
  return segs[0];
}

function titleCase(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function defaultChecks(groupKey, paths) {
  if (groupKey === 'home' || paths.some((p) => p === '/')) {
    return ['page loads without error', 'primary navigation visible', 'critical CTA works'];
  }
  if (groupKey === 'login') {
    return ['login form renders', 'auth redirect works', 'session persists after reload'];
  }
  if (groupKey === 'settings') {
    return ['settings nav loads', 'save persists after refresh', 'no layout break on sub-pages'];
  }
  return ['page loads without error', 'primary content visible', 'navigation between sub-routes works'];
}

/**
 * Turn flat UI routes into suggested operator flows (feature-level, not one flow per page).
 */
export function suggestFlowGroups(uiRoutes) {
  const groups = new Map();

  for (const route of uiRoutes) {
    const key = moduleKey(route.path);
    if (!groups.has(key)) {
      groups.set(key, {
        suggested_id: key === 'home' ? 'home' : key.replace(/_/g, '-'),
        suggested_name: titleCase(key),
        paths: [],
        sources: [],
        route_count: 0,
      });
    }
    const g = groups.get(key);
    const norm = normalizeRoute(route.path);
    if (!g.paths.includes(norm)) g.paths.push(norm);
    g.sources.push(route.source);
    g.route_count += 1;
  }

  const criticalIds = new Set(['home', 'login', 'dashboard', 'inbox', 'contacts', 'schedule']);
  return [...groups.values()]
    .map((g) => ({
      ...g,
      paths: g.paths.sort((a, b) => a.localeCompare(b)),
      critical: criticalIds.has(g.suggested_id) || g.paths.some((p) => p === '/'),
      suggested_checks: defaultChecks(g.suggested_id, g.paths),
      primary_path: g.paths.find((p) => !p.includes(':param')) || g.paths[0],
    }))
    .sort((a, b) => a.suggested_id.localeCompare(b.suggested_id));
}

/** Routes that are usually deferred (webhooks, internal admin, docs). */
export function suggestDeferred(apiRoutes, uiRoutes) {
  const deferred = [];
  for (const r of apiRoutes) {
    if (/webhook|internal|admin|debug|health/i.test(r.path)) {
      deferred.push({
        suggested_id: `defer-${r.path.replace(/^\//, '').replace(/\//g, '-')}`,
        path: r.path,
        reason: 'API/webhook — cover via tiers.smoke or integration tests',
        kind: 'api',
      });
    }
  }
  for (const r of uiRoutes) {
    if (/^\/api-docs|^\/api\/docs|^\/data-deletion|^\/privacy/.test(r.path)) {
      deferred.push({
        suggested_id: `defer-${r.path.replace(/^\//, '').replace(/\//g, '-')}`,
        path: r.path,
        reason: 'Legal/docs surface — low operator UAT priority',
        kind: 'ui',
      });
    }
  }
  return deferred;
}

/** Locate project docs agents should read before tailoring checks. */
export function findProjectDocs(projectRoot) {
  const candidates = [
    { key: 'userflow', paths: ['setup/docs/guides/USERFLOW.md', 'docs/USERFLOW.md', 'USERFLOW.md'] },
    { key: 'agents', paths: ['AGENTS.md', 'CLAUDE.md', '.agents/AGENTS.md'] },
    { key: 'readme', paths: ['README.md'] },
    { key: 'prd', paths: ['PRD.md', 'docs/PRD.md'] },
  ];
  const found = {};
  for (const { key, paths: rels } of candidates) {
    for (const rel of rels) {
      const abs = path.join(projectRoot, rel);
      if (fs.existsSync(abs)) {
        found[key] = rel;
        break;
      }
    }
  }
  return found;
}
