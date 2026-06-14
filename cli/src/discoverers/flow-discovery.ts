import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { ProjectConfig, DiscoveredFlow, Route } from '../core/types';
import { getAdapter } from '../adapters/registry';

export class FlowDiscoveryEngine {
  private config: ProjectConfig;

  constructor(config: ProjectConfig) {
    this.config = config;
  }

  async discover(): Promise<DiscoveredFlow[]> {
    const sources = await Promise.all([
      this.discoverFromGit(),
      this.discoverFromRouter(),
    ]);

    const merged = this.mergeFlows(sources.flat());
    return this.prioritize(merged);
  }

  private async discoverFromGit(): Promise<DiscoveredFlow[]> {
    try {
      const diff = execSync('git diff HEAD~5 --name-only', { encoding: 'utf-8', cwd: process.cwd() });
      const files = diff.split('\n').filter(f => f.trim());

      const flows: DiscoveredFlow[] = [];
      for (const file of files) {
        if (file.includes('page.') || file.includes('route.')) {
          const route = this.inferRouteFromFile(file);
          flows.push({
            id: `git-${route.replace(/\//g, '-')}`,
            path: [route],
            source: 'git-diff',
            confidence: 0.8,
          });
        }
        if (file.includes('form') || file.includes('input')) {
          const parentPage = await this.findParentPage(file);
          if (parentPage) {
            flows.push({
              id: `git-form-${Date.now()}`,
              path: [parentPage],
              source: 'git-diff',
              confidence: 0.6,
              hasForm: true,
            });
          }
        }
      }
      return flows;
    } catch {
      return [];
    }
  }

  private async discoverFromRouter(): Promise<DiscoveredFlow[]> {
    try {
      const adapter = getAdapter(this.config.framework);
      const routes = await adapter.extractRoutes(process.cwd());

      return routes.map(route => ({
        id: `router-${route.path.replace(/\//g, '-')}`,
        path: [route.path],
        source: 'router',
        confidence: 0.9,
        isDynamic: route.isDynamic,
        parameters: route.parameters,
      }));
    } catch {
      return [];
    }
  }

  private mergeFlows(flows: DiscoveredFlow[]): DiscoveredFlow[] {
    const merged = new Map<string, DiscoveredFlow>();

    for (const flow of flows) {
      const key = flow.path.join('->');
      const existing = merged.get(key);

      if (existing) {
        merged.set(key, {
          ...existing,
          confidence: Math.max(existing.confidence, flow.confidence),
          sources: [...(existing.sources || [existing.source]), flow.source],
        });
      } else {
        merged.set(key, flow);
      }
    }

    return Array.from(merged.values());
  }

  private prioritize(flows: DiscoveredFlow[]): DiscoveredFlow[] {
    return flows.sort((a, b) => {
      const score = (f: DiscoveredFlow) => {
        let s = f.confidence * 100;
        if (f.critical) s += 1000;
        if (f.frequency) s += f.frequency * 0.1;
        if (f.source === 'router') s += 50;
        if (f.source === 'traffic') s += 30;
        return s;
      };
      return score(b) - score(a);
    });
  }

  private inferRouteFromFile(filePath: string): string {
    return filePath
      .replace(/^src\/app\//, '/')
      .replace(/^src\/pages\//, '/')
      .replace(/^app\//, '/')
      .replace(/^pages\//, '/')
      .replace(/\/page\.(tsx|jsx|js|vue)$/, '')
      .replace(/\.(tsx|jsx|js|vue)$/, '')
      .replace(/\[(.*?)\]/g, ':$1')
      .replace(/\/index$/, '/');
  }

  private async findParentPage(filePath: string): Promise<string | null> {
    let dir = path.dirname(filePath);
    while (dir !== '.' && dir !== '/' && dir !== '') {
      const pageFiles = await glob('page.*', { cwd: dir });
      if (pageFiles.length > 0) {
        return this.inferRouteFromFile(path.join(dir, pageFiles[0]));
      }
      dir = path.dirname(dir);
    }
    return null;
  }
}
