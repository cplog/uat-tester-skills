import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import { ProjectConfig } from './types';

const selectorStrategySchema = z.object({
  primary: z.enum(['data-testid', 'aria', 'testid', 'id']).default('data-testid'),
  fallback_chain: z.array(
    z.enum(['data-testid', 'aria', 'text', 'css', 'xpath', 'visual', 'position'])
  ).default(['aria', 'text', 'visual']),
  conventions: z.record(z.any()).optional(),
});

const authSchema = z.object({
  type: z.enum(['cookie_session', 'jwt_header', 'jwt_cookie', 'oauth', 'basic', 'none']),
  login_flow: z.string().optional(),
  test_credentials: z.object({
    email: z.string().optional(),
    password: z.string().optional(),
    username: z.string().optional(),
    otp_secret: z.string().optional(),
  }).optional(),
  token_storage: z.enum(['cookie', 'localStorage', 'sessionStorage', 'memory']).optional(),
});

const flowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  path: z.array(z.string()),
  checks: z.array(z.string()).optional(),
  critical: z.boolean().default(false),
  revenue_impact: z.enum(['none', 'low', 'medium', 'high', 'critical']).optional(),
  data_driven: z.boolean().default(false),
});

const extraServiceTierSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  commands: z.array(z.string()),
});

const tiersSchema = z.object({
  static: z.array(z.string()).optional(),
  smoke: z.array(z.string()).optional(),
  smoke_url_flag: z.string().optional(),
  worker: z.array(z.string()).optional(),
  worker_optional: z.array(z.string()).optional(),
  extra_services: z.array(extraServiceTierSchema).optional(),
});

const localeSchema = z.object({
  default: z.string().optional(),
  toggle: z.boolean().optional(),
  viewport_min: z.number().optional(),
  viewport_max: z.number().optional(),
});

const aiFallbackSchema = z.object({
  enabled: z.boolean().default(false),
  trigger: z.enum(['selector_failure', 'healing_exhausted', 'manual']).default('healing_exhausted'),
  vision_provider: z.enum(['opencli', 'kimi', 'browser-use']).default('opencli'),
  rate_limit: z.number().default(5),
});

const manifestSchema = z.object({
  project_id: z.string().regex(/^[a-z0-9-]+$/),
  platform: z.enum(['web', 'mobile_web', 'pwa', 'desktop_web']),
  framework: z.enum(['nextjs', 'react', 'vue', 'svelte', 'angular', 'vanilla', 'nuxt', 'remix']),
  base_url: z.string().url(),
  selector_strategy: selectorStrategySchema.optional(),
  auth: authSchema.optional(),
  flows: z.array(flowSchema).optional(),
  tiers: tiersSchema.optional(),
  docs: z.record(z.string()).optional(),
  locale: localeSchema.optional(),
  alert_routes: z.record(z.string()).optional(),
  destructive_commands: z.array(z.string()).optional(),
  safety_notes: z.array(z.string()).optional(),
  quirks: z.array(z.string()).optional(),
  ai_fallback: aiFallbackSchema.optional(),
  environments: z.record(
    z.object({
      api_base: z.string().url().optional(),
      database_snapshot: z.string().optional(),
      read_only: z.boolean().default(false),
      notes: z.string().optional(),
      required_env: z.array(z.string()).optional(),
    })
  ).optional(),
  visual_baseline: z.object({
    max_diff_pixels: z.number().default(100),
    threshold: z.number().default(0.2),
    mask_selectors: z.array(z.string()).optional(),
  }).optional(),
  performance_budget: z.object({
    lighthouse_score: z.number().min(0).max(100).optional(),
    first_contentful_paint: z.number().optional(),
    largest_contentful_paint: z.number().optional(),
    time_to_interactive: z.number().optional(),
  }).optional(),
  parallelization: z.object({
    shards: z.number().min(1).default(4),
    workers: z.number().min(1).default(2),
  }).optional(),
  notifications: z.object({
    slack_webhook: z.string().optional(),
    email: z.string().optional(),
    pagerduty_key: z.string().optional(),
  }).optional(),
});

export function loadConfig(configPath: string = './uat-manifest.yml'): ProjectConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Manifest not found: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const raw = yaml.load(content) as any;

  // Expand environment variables
  const expanded = expandEnvVars(raw);

  const parsed = manifestSchema.safeParse(expanded);

  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid manifest:\n${issues}`);
  }

  return parsed.data as ProjectConfig;
}

export function validateConfig(configPath: string): { valid: boolean; errors: string[] } {
  try {
    loadConfig(configPath);
    return { valid: true, errors: [] };
  } catch (e: any) {
    return { valid: false, errors: [e.message] };
  }
}

export function saveConfig(config: ProjectConfig, configPath: string): void {
  const yamlContent = yaml.dump(config, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
  fs.writeFileSync(configPath, yamlContent, 'utf-8');
}

function expandEnvVars(obj: any): any {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_: string, varName: string) => {
      const [name, defaultValue] = varName.split(':');
      return process.env[name] || defaultValue || '';
    });
  }
  if (Array.isArray(obj)) {
    return obj.map(expandEnvVars);
  }
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVars(value);
    }
    return result;
  }
  return obj;
}

export function findManifests(rootPath: string = '.'): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        walk(fullPath);
      } else if (file === 'uat-manifest.yml') {
        results.push(fullPath);
      }
    }
  }

  walk(rootPath);
  return results;
}
