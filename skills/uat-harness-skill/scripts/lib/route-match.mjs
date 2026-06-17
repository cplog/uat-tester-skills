/**
 * Route normalization and fuzzy matching for audit vs discovery.
 */

export function normalizeRoute(p) {
  return (p || '/').replace(/\/+$/, '') || '/';
}

/** True when manifestPath is covered by any discovered route (exact, prefix, or parent). */
export function manifestPathMatchesDiscovery(manifestPath, discoveredPaths) {
  const norm = normalizeRoute(manifestPath);
  if (discoveredPaths.has(norm)) return true;

  for (const d of discoveredPaths) {
    if (d.startsWith(`${norm}/`) || norm.startsWith(`${d}/`)) return true;
  }
  return false;
}

/** True when at least one manifest path on the flow matches discovery. */
export function flowMatchesDiscovery(flow, discoveredPaths) {
  const paths = (flow.path || []).map(normalizeRoute).filter(Boolean);
  if (!paths.length) return false;
  return paths.some((p) => manifestPathMatchesDiscovery(p, discoveredPaths));
}

/** True when flow id appears as a URL segment on a discovered route. */
export function flowIdMatchesDiscovery(flow, discoveredUiRoutes) {
  const id = (flow.id || '').trim();
  if (!id) return false;
  return discoveredUiRoutes.some((r) => {
    const segments = normalizeRoute(r.path).split('/').filter(Boolean);
    return segments.includes(id);
  });
}

export function isFlowOrphan(flow, discoveredPaths, discoveredUiRoutes) {
  if (flowMatchesDiscovery(flow, discoveredPaths)) return false;
  if (flowIdMatchesDiscovery(flow, discoveredUiRoutes)) return false;
  return true;
}
