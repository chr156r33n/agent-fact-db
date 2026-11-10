#!/usr/bin/env node
/**
 * Batch-import seed JSON files via import-facts.mjs and update registry status.
 *
 * Usage:
 *   FACT_DB_URL=… ADMIN_PASSWORD=… node scripts/import-fs-seeds.mjs --pilot
 *   FACT_DB_URL=… ADMIN_PASSWORD=… node scripts/import-fs-seeds.mjs --slugs chicago,toronto
 *   FACT_DB_URL=… ADMIN_PASSWORD=… node scripts/import-fs-seeds.mjs --all-open
 *
 * Skips properties already marked audited; re-imports seeded/open (idempotent).
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const registryPath = join(root, 'data', 'fs-properties.json');
const importScript = join(root, 'import-facts.mjs');
const PILOT_SLUGS = ['chicago', 'toronto', 'sydney', 'paris', 'miami'];

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.includes('--pilot')) return { mode: 'pilot', slugs: PILOT_SLUGS };
  if (args.includes('--all-open')) return { mode: 'all-open' };
  const idx = args.indexOf('--slugs');
  if (idx >= 0) {
    return {
      mode: 'slugs',
      slugs: args[idx + 1].split(',').map(s => s.trim().toLowerCase())
    };
  }
  throw new Error(
    'Usage: import-fs-seeds.mjs --pilot | --slugs a,b | --all-open'
  );
}

function runImport(seedFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [importScript, seedFile], {
      cwd: root,
      env: process.env,
      stdio: 'inherit'
    });
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`import-facts exited ${code} for ${seedFile}`));
    });
  });
}

async function main() {
  if (!process.env.FACT_DB_URL || !process.env.ADMIN_PASSWORD) {
    throw new Error('Set FACT_DB_URL and ADMIN_PASSWORD');
  }
  if (!existsSync(registryPath)) {
    throw new Error('Missing data/fs-properties.json');
  }

  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  const opts = parseArgs();

  let targets = registry.properties;
  if (opts.mode === 'pilot' || opts.mode === 'slugs') {
    const set = new Set(opts.slugs);
    targets = targets.filter(p => set.has(p.slug));
  } else {
    targets = targets.filter(
      p => p.status === 'open' || p.status === 'seeded'
    );
  }

  let ok = 0;
  let failed = 0;
  for (const prop of targets) {
    const seedRel =
      prop.seed_file?.startsWith('seeds/')
        ? prop.seed_file
        : prop.note === 'enrich-only'
          ? prop.seed_file
          : `seeds/${prop.slug}-facts.json`;
    const seedFile = join(root, seedRel);
    if (!existsSync(seedFile)) {
      console.warn(`Missing seed, skip: ${seedFile}`);
      failed++;
      continue;
    }

    console.log(`\n=== Import ${prop.slug} (${seedFile}) ===`);
    try {
      await runImport(seedFile);
      // Never downgrade audited → seeded on re-import.
      if (prop.status === 'open') prop.status = 'seeded';
      prop.imported_at = new Date().toISOString();
      ok++;
    } catch (err) {
      console.error(err.message || err);
      failed++;
    }
  }

  registry.totals = {
    all: registry.properties.length,
    open: registry.properties.filter(p => p.status === 'open').length,
    seeded: registry.properties.filter(p => p.status === 'seeded').length,
    audited: registry.properties.filter(p => p.status === 'audited').length,
    skip_residence: registry.properties.filter(p => p.status === 'skip_residence')
      .length,
    skip_unopened: registry.properties.filter(p => p.status === 'skip_unopened')
      .length
  };
  registry.updated_at = new Date().toISOString();
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');

  console.log(`\nImport batch done. ok=${ok} failed=${failed}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
