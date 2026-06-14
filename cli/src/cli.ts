#!/usr/bin/env node
import { Command } from 'commander';
import * as chalk from 'chalk';
import * as ora from 'ora';
import { loadConfig, validateConfig, findManifests } from './core/config';
import { Logger } from './core/logger';
import { UATRunner } from './core/runner';
import { FlowDiscoveryEngine } from './discoverers/flow-discovery';
import { TestGenerator } from './discoverers/test-generator';
import { listSupportedFrameworks } from './adapters/registry';

const program = new Command();

program
  .name('uat')
  .description('Self-updating UAT harness for web applications')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize UAT for a project')
  .option('-f, --framework <type>', 'Framework type', 'nextjs')
  .option('-p, --project <id>', 'Project ID', 'my-project')
  .action(async (options) => {
    const spinner = ora('Initializing UAT...').start();
    try {
      const fs = require('fs');
      const template = fs.readFileSync(require.resolve('../templates/manifest-template.yml'), 'utf-8');
      const customized = template
        .replace(/project_id: .*/, `project_id: ${options.project}`)
        .replace(/framework: .*/, `framework: ${options.framework}`);
      fs.writeFileSync('./uat-manifest.yml', customized);
      spinner.succeed(`Created uat-manifest.yml for ${options.project} (${options.framework})`);
      console.log(chalk.blue('Supported frameworks:'), listSupportedFrameworks().join(', '));
    } catch (e: any) {
      spinner.fail(`Failed: ${e.message}`);
    }
  });

program
  .command('validate')
  .description('Validate manifest against schema')
  .option('-c, --config <path>', 'Config path', './uat-manifest.yml')
  .action(async (options) => {
    const spinner = ora('Validating manifest...').start();
    const result = validateConfig(options.config);
    if (result.valid) {
      spinner.succeed('Manifest is valid');
    } else {
      spinner.fail('Manifest validation failed');
      result.errors.forEach(err => console.log(chalk.red(`  ✗ ${err}`)));
      process.exit(1);
    }
  });

program
  .command('discover')
  .description('Discover and generate tests for user flows')
  .option('-c, --config <path>', 'Config path', './uat-manifest.yml')
  .option('-o, --output <dir>', 'Output directory', './tests/auto-generated')
  .action(async (options) => {
    const logger = new Logger('info', 'discover');
    const spinner = ora('Discovering flows...').start();

    try {
      const config = loadConfig(options.config);
      const discoverer = new FlowDiscoveryEngine(config);
      const flows = await discoverer.discover();

      spinner.text = `Discovered ${flows.length} flows, generating tests...`;

      const generator = new TestGenerator(config);
      const tests = await generator.generate(flows);

      // Write tests
      const fs = require('fs');
      const path = require('path');
      fs.mkdirSync(options.output, { recursive: true });

      for (const test of tests) {
        const filename = `${test.id}.spec.ts`;
        const content = generateSpecFile(test, config);
        fs.writeFileSync(path.join(options.output, filename), content);
      }

      spinner.succeed(`Generated ${tests.length} tests in ${options.output}`);
      logger.info('Discovery complete');
    } catch (e: any) {
      spinner.fail(`Discovery failed: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Run the UAT test suite')
  .option('-c, --config <path>', 'Config path', './uat-manifest.yml')
  .option('--critical', 'Run only critical path tests', false)
  .option('--shard <shard>', 'Shard index (e.g., 1/4)', '1/1')
  .option('--healing <mode>', 'Healing mode: auto, manual, off', 'auto')
  .action(async (options) => {
    const logger = new Logger('info', 'test');
    const spinner = ora('Loading configuration...').start();

    try {
      const config = loadConfig(options.config);
      spinner.text = `Running tests for ${config.project_id}...`;

      const runner = new UATRunner(config, logger);
      await runner.initialize();

      // Discover and run tests
      const discoverer = new FlowDiscoveryEngine(config);
      const flows = await discoverer.discover();
      const generator = new TestGenerator(config);
      const tests = await generator.generate(flows);

      const criticalOnly = options.critical;
      const testsToRun = criticalOnly
        ? tests.filter(t => t.priority === 'critical')
        : tests;

      spinner.text = `Running ${testsToRun.length} tests...`;

      const results = [];
      for (const test of testsToRun) {
        const result = await runner.runTest(test);
        results.push(result);
        spinner.text = `Progress: ${results.length}/${testsToRun.length} (${results.filter(r => r.status === 'passed').length} passed)`;
      }

      await runner.cleanup();

      const passed = results.filter(r => r.status === 'passed').length;
      const failed = results.filter(r => r.status === 'failed').length;
      const healed = results.filter(r => r.status === 'healed').length;

      if (failed === 0) {
        spinner.succeed(`All ${passed} tests passed${healed > 0 ? ` (${healed} healed)` : ''}`);
      } else {
        spinner.fail(`${failed} of ${results.length} tests failed`);
        process.exit(1);
      }
    } catch (e: any) {
      spinner.fail(`Test run failed: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command('heal')
  .description('Run self-healing on failed selectors')
  .option('-c, --config <path>', 'Config path', './uat-manifest.yml')
  .option('--report <dir>', 'Test results directory', './test-results')
  .action(async (options) => {
    const logger = new Logger('info', 'heal');
    const spinner = ora('Analyzing failures for healing...').start();

    try {
      const config = loadConfig(options.config);
      // Healing logic would analyze test-results and attempt fixes
      spinner.succeed('Healing analysis complete (placeholder)');
    } catch (e: any) {
      spinner.fail(`Healing failed: ${e.message}`);
    }
  });

program
  .command('baseline')
  .description('Manage visual baselines')
  .option('update', 'Update baselines')
  .option('--approve-minor', 'Auto-approve minor changes', false)
  .action(async (options) => {
    console.log(chalk.blue('Baseline management (placeholder)'));
    console.log('Use Playwright directly for baseline updates:');
    console.log(chalk.dim('  npx playwright test --update-snapshots'));
  });

program
  .command('report')
  .description('Generate test reports')
  .option('-i, --input <dir>', 'Input directory', './test-results')
  .option('-f, --format <formats>', 'Output formats (html,json,slack)', 'html')
  .option('-o, --output <dir>', 'Output directory', './report')
  .action(async (options) => {
    console.log(chalk.blue('Report generation (placeholder)'));
    console.log('Formats:', options.format);
  });

program
  .command('dashboard')
  .description('Launch local dashboard server')
  .option('-p, --port <number>', 'Port', '3000')
  .action(async (options) => {
    console.log(chalk.blue(`Dashboard server would start on port ${options.port}`));
    console.log(chalk.dim('(Full implementation requires HTTP server setup)'));
  });

function generateSpecFile(test: any, config: any): string {
  return `import { test, expect } from '@playwright/test';
import { UATRunner } from '@uat-tester/cli';
import { loadConfig } from '@uat-tester/cli/core/config';

test('${test.name}', async ({ page }) => {
  const config = loadConfig('./uat-manifest.yml');
  const runner = new UATRunner(config);
  await runner.initialize();

  // Test steps would be executed here
  // Generated from flow: ${test.flowId}

  await runner.cleanup();
});
`;
}

program.parse();
