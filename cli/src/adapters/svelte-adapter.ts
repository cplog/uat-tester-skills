import { Page, Locator } from '@playwright/test';
import { PlatformAdapter, SelectorChain, Route, ComponentNode } from './base-adapter';
import * as fs from 'fs';
import * as path from 'path';

export class SvelteAdapter implements PlatformAdapter {
  readonly framework = 'svelte';

  async waitForNavigation(page: Page, url: string): Promise<void> {
    await page.waitForURL(url, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
  }

  async findElement(page: Page, selector: SelectorChain): Promise<Locator> {
    return page.locator(selector.primary.value);
  }

  async waitForStableState(page: Page): Promise<void> {
    await page.waitForLoadState('networkidle');
  }

  async applyQuirks(page: Page, quirks: string[]): Promise<void> {
    for (const quirk of quirks) {
      if (quirk.includes('transition')) {
        await page.waitForTimeout(300);
      }
      if (quirk.includes('intersection')) {
        await page.evaluate(() => {
          document.querySelectorAll('[data-testid]').forEach(el => {
            el.scrollIntoView({ block: 'center' });
          });
        });
      }
    }
  }

  async extractRoutes(projectPath: string): Promise<Route[]> {
    const routes: Route[] = [];
    const routesFile = path.join(projectPath, 'src', 'routes.js');
    if (fs.existsSync(routesFile)) {
      const content = fs.readFileSync(routesFile, 'utf-8');
      const matches = content.matchAll(/['"]([^'"]+)['"]/g);
      for (const match of matches) {
        if (match[1].startsWith('/')) {
          routes.push({ path: match[1], isDynamic: match[1].includes(':') });
        }
      }
    }
    return routes;
  }

  async analyzeComponentTree(page: Page): Promise<ComponentNode[]> {
    return page.evaluate(() => {
      const tree: ComponentNode[] = [];
      const walk = (el: Element): ComponentNode => {
        const node: ComponentNode = {
          name: el.tagName.toLowerCase(),
          selector: el.getAttribute('data-testid') || el.id || el.className,
          children: [],
        };
        for (const child of el.children) {
          node.children.push(walk(child));
        }
        return node;
      };
      for (const child of document.body.children) {
        tree.push(walk(child));
      }
      return tree;
    });
  }
}
