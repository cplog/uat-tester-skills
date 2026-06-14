import { Page, Locator } from '@playwright/test';
import { PlatformAdapter, SelectorChain, Route, ComponentNode } from './base-adapter';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

export class NextJsAdapter implements PlatformAdapter {
  readonly framework = 'nextjs';

  async waitForNavigation(page: Page, url: string): Promise<void> {
    await Promise.all([
      page.waitForURL(url, { waitUntil: 'networkidle' }),
      page.waitForLoadState('networkidle'),
    ]);

    // Wait for Next.js hydration
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        if ((window as any).__NEXT_DATA__) {
          resolve();
        } else {
          setTimeout(() => resolve(), 100);
        }
      });
    });
  }

  async findElement(page: Page, selector: SelectorChain): Promise<Locator> {
    const locator = page.locator(selector.primary.value);
    if (await locator.evaluate(el => el.tagName === 'IMG')) {
      await locator.waitFor({ state: 'visible' });
    }
    return locator;
  }

  async waitForStableState(page: Page): Promise<void> {
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.readyState === 'complete');
  }

  async applyQuirks(page: Page, quirks: string[]): Promise<void> {
    for (const quirk of quirks) {
      if (quirk.includes('portal')) {
        await page.waitForSelector('body > div[role="dialog"]', { state: 'attached', timeout: 5000 }).catch(() => {});
      }
      if (quirk.includes('optimistic')) {
        await page.waitForResponse(resp => resp.url().includes('/api/'), { timeout: 5000 }).catch(() => {});
      }
      if (quirk.includes('iframe')) {
        const frames = page.frames();
        for (const frame of frames) {
          if (await frame.locator('[data-testid="payment-form"]').count() > 0) {
            (page as any).__paymentFrame = frame;
          }
        }
      }
    }
  }

  async extractRoutes(projectPath: string): Promise<Route[]> {
    const routes: Route[] = [];
    const pagesDir = path.join(projectPath, 'src', 'app');
    const appDir = path.join(projectPath, 'app');
    const srcPagesDir = path.join(projectPath, 'src', 'pages');
    const pagesDirOld = path.join(projectPath, 'pages');

    const targetDirs = [pagesDir, appDir, srcPagesDir, pagesDirOld].filter(d => fs.existsSync(d));

    for (const dir of targetDirs) {
      const isAppRouter = dir.includes('app');
      const pattern = isAppRouter ? '**/page.*' : '**/*.*';
      const files = await glob(pattern, { cwd: dir });

      for (const file of files) {
        if (file.startsWith('_')) continue;
        const routePath = file
          .replace(/\/page\.(tsx|jsx|js|vue)$/, '')
          .replace(/\.(tsx|jsx|js|vue)$/, '')
          .replace(/\[(.*?)\]/g, ':$1');

        routes.push({
          path: routePath === '' || routePath === 'index' ? '/' : `/${routePath}`,
          isDynamic: file.includes('['),
          parameters: this.extractParameters(file),
        });
      }
    }

    return routes;
  }

  private extractParameters(filePath: string): string[] {
    const matches = filePath.match(/\[(.*?)\]/g);
    return matches ? matches.map(m => m.slice(1, -1)) : [];
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
