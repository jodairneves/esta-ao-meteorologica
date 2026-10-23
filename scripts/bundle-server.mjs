// Bundles a server app, with the workspace packages it imports as TypeScript source, into one
// ES module for the production image (design §9.1). Next to it goes a package.json listing the
// packages left out of the bundle, at the versions installed here, for `npm install` in the image.
// Usage: node scripts/bundle-server.mjs <collector|dashboard>
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';

const APPS = {
  collector: {
    dir: 'apps/collector',
    entry: 'src/main.ts',
    outfile: 'dist/main.mjs',
    runtime: [],
  },
  dashboard: {
    dir: 'apps/dashboard',
    entry: 'src/server/main.ts',
    outfile: 'dist/server/main.mjs',
    // Native addon (password hashing): one prebuilt binary per platform.
    runtime: ['@node-rs/argon2'],
  },
};

const app = APPS[process.argv[2]];
if (!app) {
  console.error(`usage: node scripts/bundle-server.mjs <${Object.keys(APPS).join('|')}>`);
  process.exit(1);
}

const outfile = join(app.dir, app.outfile);
await build({
  entryPoints: [join(app.dir, app.entry)],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  legalComments: 'none',
  // `runtime` packages are installed in the image; the others are optional peers unused here.
  external: [...app.runtime, 'pg-native', 'bufferutil', 'utf-8-validate', 'pino-pretty'],
  // CommonJS dependencies call require() for Node built-ins, which an ES module does not have.
  banner: {
    js: "import { createRequire as __wxCreateRequire } from 'node:module'; const require = __wxCreateRequire(import.meta.url);",
  },
  logLevel: 'info',
});

const appRequire = createRequire(resolve(app.dir, 'package.json'));
const dependencies = Object.fromEntries(
  app.runtime.map((name) => [name, appRequire(`${name}/package.json`).version]),
);
await writeFile(
  join(dirname(outfile), 'package.json'),
  `${JSON.stringify({ private: true, type: 'module', dependencies }, null, 2)}\n`,
);
