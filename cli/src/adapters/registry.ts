import { PlatformAdapter } from './base-adapter';
import { NextJsAdapter } from './nextjs-adapter';
import { VueAdapter } from './vue-adapter';
import { ReactAdapter } from './react-adapter';
import { SvelteAdapter } from './svelte-adapter';

const adapters: Record<string, new () => PlatformAdapter> = {
  nextjs: NextJsAdapter,
  nuxt: VueAdapter,
  vue: VueAdapter,
  react: ReactAdapter,
  remix: ReactAdapter,
  svelte: SvelteAdapter,
};

export function getAdapter(framework: string): PlatformAdapter {
  const AdapterClass = adapters[framework];
  if (!AdapterClass) {
    throw new Error(`No adapter available for framework: ${framework}. Available: ${Object.keys(adapters).join(', ')}`);
  }
  return new AdapterClass();
}

export function listSupportedFrameworks(): string[] {
  return Object.keys(adapters);
}
