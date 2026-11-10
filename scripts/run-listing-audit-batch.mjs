#!/usr/bin/env node
/**
 * Scaffold listing-audit report folders and a checklist for agent/MCP runs.
 * Does not call Yext/GBP itself — those stay on MCP (see property-fact-audit skill).
 *
 * Usage:
 *   node scripts/run-listing-audit-batch.mjs --pilot
 *   node scripts/run-listing-audit-batch.mjs --slugs chicago,toronto
 *   node scripts/run-listing-audit-batch.mjs --mark-audited chicago
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const registryPath = join(root, 'data', 'fs-properties.json');
const auditsDir = join(root, 'audits', 'listings');
const PILOT_SLUGS = ['chicago', 'toronto', 'sydney', 'paris', 'miami'];

function loadRegistry() {
  return JSON.parse(readFileSync(registryPath, 'utf8'));
}

function saveRegistry(registry) {
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
}

function reportTemplate(prop) {
  return `# ${prop.name} — listing audit

Slug: \`${prop.slug}\`
Site: ${prop.site_url}
Press facts: ${prop.press_hotel_facts_url}
Yext hotel id: ${prop.yext_id || '_unknown — resolve via folders / websiteUrl_'}
Status at scaffold: ${prop.status}

## Checklist

- [ ] 1. Resolve Fact DB list_id
- [ ] 2. list_pages; assign unassigned facts when source_url maps cleanly
- [ ] 3. Load accepted facts (include_unapproved for pending gaps)
- [ ] 4. Map Yext entities (hotel + dining + spa/closed)
- [ ] 5. Pull GBP for hotel and each dining/spa listing
- [ ] 6. Fetch first-party dining / spa / contact pages
- [ ] 7. Compare NAP, hours, categories, website paths
- [ ] 8. record_source_finding (quote + party + verdict)
- [ ] 9. propose_fact for gaps; assess_fact confirm/contest
- [ ] 10. Flag duplicates; dismiss noisy findings
- [ ] 11. Summarise matches, contradictions, pending human actions

## Matches

_None yet._

## Contradictions

_None yet._

## Pending human actions

_None yet._

## Notes

Follow \`.cursor/skills/property-fact-audit/SKILL.md\`.
When complete, run:

\`\`\`sh
node scripts/run-listing-audit-batch.mjs --mark-audited ${prop.slug}
\`\`\`
`;
}

function main() {
  const args = process.argv.slice(2);
  const registry = loadRegistry();
  const bySlug = new Map(registry.properties.map(p => [p.slug, p]));

  const markIdx = args.indexOf('--mark-audited');
  if (markIdx >= 0) {
    const slug = args[markIdx + 1];
    const prop = bySlug.get(slug);
    if (!prop) throw new Error(`Unknown slug ${slug}`);
    prop.status = 'audited';
    prop.audited_at = new Date().toISOString();
    saveRegistry(registry);
    console.log(`Marked audited: ${slug}`);
    return;
  }

  let slugs;
  if (args.includes('--pilot')) slugs = PILOT_SLUGS;
  else if (args.includes('--slugs')) {
    slugs = args[args.indexOf('--slugs') + 1]
      .split(',')
      .map(s => s.trim().toLowerCase());
  } else {
    throw new Error(
      'Usage: run-listing-audit-batch.mjs --pilot | --slugs a,b | --mark-audited slug'
    );
  }

  mkdirSync(auditsDir, { recursive: true });
  for (const slug of slugs) {
    const prop = bySlug.get(slug);
    if (!prop) {
      console.warn(`Unknown slug: ${slug}`);
      continue;
    }
    const dir = join(auditsDir, slug);
    mkdirSync(dir, { recursive: true });
    const report = join(dir, 'REPORT.md');
    if (!existsSync(report)) {
      writeFileSync(report, reportTemplate(prop));
      console.log(`Scaffolded ${report}`);
    } else {
      console.log(`Exists ${report}`);
    }
  }
}

main();
