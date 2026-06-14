import { Page, Locator } from '@playwright/test';
import { SelectorChain, Selector, HealingEvent } from '../core/types';

export class SelectorExhaustedError extends Error {
  constructor(public chain: SelectorChain) {
    super('All selector strategies exhausted');
  }
}

export class SelectorEngine {
  private page: Page;
  private fallbackChain: string[];

  constructor(page: Page, selectorStrategy: any) {
    this.page = page;
    this.fallbackChain = selectorStrategy.fallback_chain || ['aria', 'text', 'visual'];
  }

  async resolve(chain: SelectorChain): Promise<Locator> {
    const allSelectors = [chain.primary, ...chain.fallbacks];

    for (const selector of allSelectors) {
      try {
        const locator = await this.trySelector(selector);
        if (locator) {
          await locator.waitFor({ state: 'visible', timeout: 5000 });
          return locator;
        }
      } catch (e) {
        // Continue to fallback
      }
    }

    throw new SelectorExhaustedError(chain);
  }

  private async trySelector(selector: Selector): Promise<Locator | null> {
    switch (selector.type) {
      case 'data-testid':
        return this.page.locator(`[data-testid="${selector.value}"]`);

      case 'aria': {
        const parts = selector.value.split('=');
        const role = parts[0];
        const name = parts[1] || '.*';
        return this.page.getByRole(role as any, { name: new RegExp(name, 'i') });
      }

      case 'text':
        return this.page.getByText(new RegExp(selector.value, 'i'));

      case 'css':
        return this.page.locator(selector.value);

      case 'xpath':
        return this.page.locator(`xpath=${selector.value}`);

      case 'position':
        // Position-based fallback — simplified
        return this.page.locator('body').locator('css=*').first();

      case 'visual':
        // Visual fallback — delegated to AIHealer
        return null;

      default:
        return null;
    }
  }

  async heal(chain: SelectorChain): Promise<SelectorChain | null> {
    const healed = await this.structuralHeal(chain);
    if (healed) {
      return this.updateChain(chain, healed, 'structural');
    }
    return null;
  }

  private async structuralHeal(chain: SelectorChain): Promise<Selector | null> {
    const failed = chain.primary;

    // Strategy 1: Find similar data-testid
    if (failed.type === 'data-testid') {
      const allTestIds = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('[data-testid]'))
          .map(el => el.getAttribute('data-testid'))
          .filter(Boolean) as string[];
      });

      const closest = this.findClosestString(failed.value, allTestIds);
      if (closest && this.similarity(failed.value, closest) > 0.8) {
        return { type: 'data-testid', value: closest, weight: failed.weight };
      }
    }

    // Strategy 2: Find by ARIA role + nearby text
    if (failed.type === 'aria') {
      const parts = failed.value.split('=');
      const role = parts[0];
      const name = parts[1] || '';
      const elements = await this.page.locator(`[role="${role}"]`).all();
      for (const el of elements) {
        const text = await el.textContent();
        if (text && this.similarity(text, name) > 0.7) {
          const testId = await el.getAttribute('data-testid');
          if (testId) {
            return { type: 'data-testid', value: testId, weight: 100 };
          }
        }
      }
    }

    // Strategy 3: CSS class migration
    if (failed.type === 'css') {
      const tagName = this.inferTagName(failed.value);
      const elements = await this.page.locator(`${tagName}`).all();
      for (const el of elements) {
        const text = await el.textContent();
        if (text && text.length > 0) {
          return { type: 'text', value: text.slice(0, 50), weight: 50 };
        }
      }
    }

    return null;
  }

  private findClosestString(target: string, candidates: string[]): string | null {
    let best: string | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const score = this.similarity(target, candidate);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return bestScore > 0.6 ? best : null;
  }

  private similarity(a: string, b: string): number {
    const distance = this.levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - distance / maxLen;
  }

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const indicator = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
          matrix[i - 1][j - 1] + indicator
        );
      }
    }
    return matrix[b.length][a.length];
  }

  private updateChain(chain: SelectorChain, healed: Selector, method: string): SelectorChain {
    return {
      ...chain,
      primary: healed,
      healingHistory: [
        ...chain.healingHistory,
        {
          timestamp: new Date(),
          failedSelector: chain.primary,
          healedSelector: healed,
          similarityScore: this.similarity(chain.primary.value, healed.value),
          testId: 'healing-run',
          autoApplied: true,
        }
      ],
      confidenceScore: chain.confidenceScore * 0.95,
    };
  }

  private inferTagName(cssSelector: string): string {
    const match = cssSelector.match(/^([a-zA-Z]+)/);
    return match ? match[1] : 'div';
  }
}
