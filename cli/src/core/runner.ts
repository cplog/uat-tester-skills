import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';
import { ProjectConfig, TestResult, GeneratedTest, TestStep, Selector } from './types';
import { Logger } from './logger';
import { getAdapter } from '../adapters/registry';
import { SelectorEngine } from '../healers/selector-engine';
import { AIHealer } from '../healers/ai-healer';

export class UATRunner {
  private config: ProjectConfig;
  private logger: Logger;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private selectorEngine: SelectorEngine | null = null;
  private aiHealer: AIHealer | null = null;

  constructor(config: ProjectConfig, logger: Logger = new Logger()) {
    this.config = config;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    this.logger.info(`Initializing runner for ${this.config.project_id} (${this.config.framework})`);

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const viewport = this.config.platform === 'mobile_web'
      ? { width: 375, height: 812 }
      : { width: 1280, height: 720 };

    this.context = await this.browser.newContext({
      viewport,
      userAgent: this.config.platform === 'mobile_web'
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'
        : undefined,
    });

    this.page = await this.context.newPage();
    this.selectorEngine = new SelectorEngine(this.page, this.config.selector_strategy);

    if (this.config.ai_fallback?.enabled) {
      this.aiHealer = new AIHealer(this.page, this.config.ai_fallback);
    }

    // Apply framework-specific quirks
    const adapter = getAdapter(this.config.framework);
    if (this.config.quirks) {
      await adapter.applyQuirks(this.page, this.config.quirks);
    }

    this.logger.info('Runner initialized');
  }

  async authenticate(): Promise<void> {
    const auth = this.config.auth;
    if (!auth || auth.type === 'none' || !auth.login_flow) {
      return;
    }

    this.logger.info(`Authenticating via ${auth.type}`);

    const { test_credentials, login_flow, type } = auth;
    if (!test_credentials) {
      throw new Error('Test credentials required for authentication');
    }

    await this.page!.goto(`${this.config.base_url}${login_flow}`, { waitUntil: 'networkidle' });

    // Fill login form
    if (test_credentials.email) {
      await this.page!.fill('input[type="email"], input[name="email"], [data-testid*="email"]', test_credentials.email);
    }
    if (test_credentials.username) {
      await this.page!.fill('input[type="text"], input[name="username"], [data-testid*="username"]', test_credentials.username);
    }
    if (test_credentials.password) {
      await this.page!.fill('input[type="password"], input[name="password"], [data-testid*="password"]', test_credentials.password);
    }

    await this.page!.click('button[type="submit"], [data-testid*="submit"], [data-testid*="login"]');
    await this.page!.waitForLoadState('networkidle');

    // Store auth state
    if (type === 'cookie_session') {
      // Cookies are automatically handled by context
    } else if (type === 'jwt_header' || type === 'jwt_cookie') {
      // Token handling is automatic via cookies/localStorage
    }

    this.logger.info('Authentication complete');
  }

  async runTest(test: GeneratedTest): Promise<TestResult> {
    const startTime = Date.now();
    const result: TestResult = {
      testId: test.id,
      runId: `run-${Date.now()}`,
      status: 'passed',
      durationMs: 0,
      screenshots: [],
      traces: [],
      apiLogs: [],
    };

    this.logger.info(`Running test: ${test.name}`);

    try {
      for (const step of test.steps) {
        await this.executeStep(step, result);
      }
    } catch (e: any) {
      result.status = 'failed';
      result.failureType = e.message;
      this.logger.error(`Test failed: ${e.message}`);

      // Capture screenshot on failure
      const screenshotPath = `test-results/${test.id}-failure.png`;
      await this.page!.screenshot({ path: screenshotPath, fullPage: true });
      result.screenshots.push(screenshotPath);
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  private async executeStep(step: TestStep, result: TestResult): Promise<void> {
    this.logger.debug(`Step: ${step.action} ${step.target.value}`);

    switch (step.action) {
      case 'navigate':
        await this.page!.goto(`${this.config.base_url}${step.target.value}`, { waitUntil: 'networkidle' });
        break;

      case 'click':
        const clickLocator = await this.resolveSelector(step.target);
        await clickLocator.click();
        break;

      case 'type':
      case 'fill':
        const fillLocator = await this.resolveSelector(step.target);
        await fillLocator.fill(step.value || '');
        break;

      case 'select':
        const selectLocator = await this.resolveSelector(step.target);
        await selectLocator.selectOption(step.value || '');
        break;

      case 'assert':
        for (const assertion of step.assertions) {
          await this.executeAssertion(assertion);
        }
        break;

      case 'wait':
        await this.page!.waitForTimeout(parseInt(step.value || '1000'));
        break;

      case 'authenticate':
        await this.authenticate();
        break;

      default:
        throw new Error(`Unknown step action: ${step.action}`);
    }
  }

  private async resolveSelector(selector: Selector): Promise<any> {
    if (!this.selectorEngine) {
      throw new Error('Selector engine not initialized');
    }

    try {
      return await this.selectorEngine.resolve({
        primary: selector,
        fallbacks: [],
        healingHistory: [],
        confidenceScore: 1.0,
      });
    } catch (e) {
      // Try AI fallback if available
      if (this.aiHealer) {
        this.logger.warn('DOM selectors failed, attempting AI vision fallback');
        const healed = await this.aiHealer.heal(
          { primary: selector, fallbacks: [], healingHistory: [], confidenceScore: 1.0 },
          `Find element: ${selector.value}`
        );
        if (healed) {
          return healed;
        }
      }
      throw e;
    }
  }

  private async executeAssertion(assertion: any): Promise<void> {
    switch (assertion.type) {
      case 'url':
        const expectedUrl = assertion.expected instanceof RegExp
          ? assertion.expected
          : new RegExp(assertion.expected);
        const currentUrl = this.page!.url();
        if (!expectedUrl.test(currentUrl)) {
          throw new Error(`URL assertion failed: expected ${assertion.expected}, got ${currentUrl}`);
        }
        break;

      case 'element':
        const locator = this.page!.locator(assertion.selector || 'body');
        if (assertion.state === 'visible') {
          await locator.waitFor({ state: 'visible' });
        } else if (assertion.state === 'hidden') {
          await locator.waitFor({ state: 'hidden' });
        }
        break;

      case 'text':
        const textLocator = this.page!.locator('body');
        const text = await textLocator.textContent();
        const expectedText = assertion.expected instanceof RegExp
          ? assertion.expected
          : new RegExp(assertion.expected, 'i');
        if (!text || !expectedText.test(text)) {
          throw new Error(`Text assertion failed: expected ${assertion.expected}`);
        }
        break;

      case 'load':
        if (assertion.state === 'networkidle') {
          await this.page!.waitForLoadState('networkidle');
        }
        break;

      default:
        this.logger.warn(`Unknown assertion type: ${assertion.type}`);
    }
  }

  async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    this.logger.info('Runner cleanup complete');
  }
}
