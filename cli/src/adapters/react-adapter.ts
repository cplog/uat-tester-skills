import { Page, Locator } from '@playwright/test';
import { PlatformAdapter, SelectorChain, Route, ComponentNode } from './base-adapter';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

export class ReactAdapter implements PlatformAdapter {
  readonly framework = 'react';

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
      if (quirk.includes('suspense')) {
        await page.waitForSelector('[data-testid="loading"]', { state: 'detached', timeout: 10000 }).catch(() => {});
      }
      if (quirk.includes('lazy')) {
        await page.waitForLoadState('networkidle');
      }
    }
  }

  async extractRoutes(projectPath: string): Promise<Route[]> {
    const routes: Route[] = [];
    const routerFiles = [
      path.join(projectPath, 'src', 'App.tsx'),
      path.join(projectPath, 'src', 'App.jsx'),
      path.join(projectPath, 'src', 'routes.tsx'),
      path.join(projectPath, 'src', 'routes.jsx'),
    ];

    for (const file of routerFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        const matches = content.matchAll(/path=["']([^"']+)["']/g);
        for (const match of matches) {
          routes.push({
            path: match[1],
            isDynamic: match[1].includes(':') || match[1].includes('*'),
          });
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
