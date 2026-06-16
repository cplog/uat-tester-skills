import { Page, Locator } from '@playwright/test';
import { SelectorChain, Route, ComponentNode } from '../core/types';

export { SelectorChain, Route, ComponentNode };

export interface PlatformAdapter {
  readonly framework: string;

  waitForNavigation(page: Page, url: string): Promise<void>;
  findElement(page: Page, selector: SelectorChain): Promise<Locator>;
  waitForStableState(page: Page): Promise<void>;
  applyQuirks(page: Page, quirks: string[]): Promise<void>;
  extractRoutes(projectPath: string): Promise<Route[]>;
  analyzeComponentTree(page: Page): Promise<ComponentNode[]>;
}
