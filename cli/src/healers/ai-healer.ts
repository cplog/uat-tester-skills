import { spawn } from 'child_process';
import { Page, Locator } from '@playwright/test';
import { SelectorChain, AIFallbackConfig } from '../core/types';

export class AIHealer {
  private page: Page;
  private config: AIFallbackConfig;
  private callCount: number = 0;

  constructor(page: Page, config: AIFallbackConfig) {
    this.page = page;
    this.config = config;
  }

  async heal(chain: SelectorChain, targetDescription: string): Promise<Locator | null> {
    if (!this.config.enabled) return null;
    if (this.callCount >= (this.config.rate_limit || 5)) {
      console.warn('AI vision rate limit exceeded');
      return null;
    }

    this.callCount++;

    try {
      const screenshot = await this.page.screenshot({ type: 'png' });
      const bbox = await this.callOpenCLI(screenshot, targetDescription);

      if (bbox) {
        await this.page.mouse.click(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
        return this.page.locator('body');
      }
    } catch (e) {
      console.error('AI vision healing failed:', e);
    }

    return null;
  }

  private async callOpenCLI(screenshot: Buffer, description: string): Promise<any | null> {
    return new Promise((resolve, reject) => {
      const tmpFile = `/tmp/uat-screenshot-${Date.now()}.png`;
      require('fs').writeFileSync(tmpFile, screenshot);

      const opencli = spawn('opencli', [
        'vision', 'find',
        '--image', tmpFile,
        '--description', description,
        '--format', 'json'
      ]);

      let output = '';
      opencli.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      opencli.on('close', (code: number | null) => {
        try { require('fs').unlinkSync(tmpFile); } catch {}

        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result.bbox || null);
          } catch {
            resolve(null);
          }
        } else {
          reject(new Error(`OpenCLI exited with code ${code}`));
        }
      });
    });
  }
}
