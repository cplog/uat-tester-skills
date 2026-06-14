import { Page, Locator } from '@playwright/test';
import { PlatformAdapter, SelectorChain, Route, ComponentNode } from './base-adapter';
import * as fs from 'fs';
import * as path from 'path';

export class VueAdapter implements PlatformAdapter {
  readonly framework = 'vue';

  async waitForNavigation(page: Page, url: string): Promise<void> {
    await page.waitForURL(url, { waitUntil: 'networkidle' });

    // Wait for Vue transitions
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const check = () => {
          const active = document.querySelectorAll('.v-enter-active, .v-leave-active, .fade-enter-active, .fade-leave-active');
          if (active.length === 0) {
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    });
  }

  async findElement(page: Page, selector: SelectorChain): Promise<Locator> {
    return page.locator(selector.primary.value);
  }

  async waitForStableState(page: Page): Promise<void> {
    await page.waitForLoadState('networkidle');
  }

  async applyQuirks(page: Page, quirks: string[]): Promise<void> {
    for (const quirk of quirks) {
      if (quirk.includes('virtual scroll')) {
        await page.evaluate(() => {
          const table = document.querySelector('.virtual-scroll-table, [data-testid*="virtual"]');
          if (table) table.scrollIntoView({ block: 'center' });
        });
      }
      if (quirk.includes('toast')) {
        await page.waitForTimeout(100);
      }
      if (quirk.includes('vuex') || quirk.includes('pinia')) {
        const token = await page.evaluate(() => localStorage.getItem('token') || localStorage.getItem('auth'));
        if (!token) {
          await page.goto('/auth/login');
        }
      }
    }
  }

  async extractRoutes(projectPath: string): Promise<Route[]> {
    const routes: Route[] = [];
    const routerFiles = [
      path.join(projectPath, 'src', 'router', 'index.ts'),
      path.join(projectPath, 'src', 'router', 'index.js'),
      path.join(projectPath, 'router.ts'),
      path.join(projectPath, 'router.js'),
    ];

    for (const routerFile of routerFiles) {
      if (fs.existsSync(routerFile)) {
        const content = fs.readFileSync(routerFile, 'utf-8');
        const routeMatches = content.matchAll(/path:\s*['"]([^'"]+)['"]/g);
        for (const match of routeMatches) {
          routes.push({
            path: match[1],
            isDynamic: match[1].includes(':'),
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
