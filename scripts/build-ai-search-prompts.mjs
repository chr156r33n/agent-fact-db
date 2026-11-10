#!/usr/bin/env node
/**
 * Build atomic / per-page / property-brief prompts from a smoke or scale pack.
 * Usage: node scripts/build-ai-search-prompts.mjs audits/ai-search/.../pack.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const packPath = process.argv[2];
if (!packPath) {
  console.error('Usage: node scripts/build-ai-search-prompts.mjs <pack.json>');
  process.exit(1);
}

const pack = JSON.parse(readFileSync(packPath, 'utf8'));
const root = dirname(packPath);
const contract = `Return JSON only. Schema:
{
  "method": "<method>",
  "property": "${pack.property}",
  "results": [{
    "fact_id": "...",
    "model_answer": "short",
    "verdict": "matches|contradicts|unclear|not_found",
    "cited_urls": ["https://domain/path"],
    "contradicting_sources": ["https://domain/path"],
    "notes": ""
  }],
  "metrics": { "search_tool_rounds": <int>, "notes": "" }
}

Rules:
- Use web search for every claim.
- On contradicts, list EVERY URL that supports the conflicting value (domain+path). No primary-only. No party filter.
- Strip tracking query params. Keep path.
- Empty contradicting_sources on a contradicts row is incomplete — keep searching.
`;

const byPage = new Map(pack.pages.map((p) => [p.id, { ...p, facts: [] }]));
for (const f of pack.facts) {
  if (!byPage.has(f.page_id)) throw new Error(`Unknown page_id ${f.page_id}`);
  byPage.get(f.page_id).facts.push(f);
}

function claimBlock(facts) {
  return facts
    .map(
      (f, i) =>
        `${i + 1}. fact_id=${f.id}\n   topic: ${f.topic}\n   SoT claim: ${f.claim}`
    )
    .join('\n\n');
}

const atomicDir = join(root, 'prompts', 'atomic');
mkdirSync(atomicDir, { recursive: true });
pack.facts.forEach((f, i) => {
  const page = byPage.get(f.page_id);
  const body = `Method: atomic
Property: ${pack.property}
Inventory page: ${page.title} (${page.url})

Check this single approved SoT claim against what web search currently says.

${claimBlock([f])}

${contract.replace('<method>', 'atomic')}
`;
  writeFileSync(join(atomicDir, `${String(i + 1).padStart(2, '0')}-${f.id.slice(0, 8)}.txt`), body);
});

const perPageDir = join(root, 'prompts', 'per-page');
mkdirSync(perPageDir, { recursive: true });
for (const page of byPage.values()) {
  const slug = page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const body = `Method: per-page
Property: ${pack.property}
Inventory page: ${page.title} (${page.url})

Check each approved SoT claim on this page independently against web search.

${claimBlock(page.facts)}

${contract.replace('<method>', 'per-page')}
`;
  writeFileSync(join(perPageDir, `${slug}.txt`), body);
}

const briefDir = join(root, 'prompts', 'property-brief');
mkdirSync(briefDir, { recursive: true });
const briefBody = `Method: property-brief
Property: ${pack.property}
Pages: ${pack.pages.map((p) => `${p.title} (${p.url})`).join('; ')}

Check each approved SoT claim independently against web search.

${claimBlock(pack.facts)}

${contract.replace('<method>', 'property-brief')}
`;
writeFileSync(join(briefDir, 'all.txt'), briefBody);

console.log(
  JSON.stringify(
    {
      facts: pack.facts.length,
      pages: pack.pages.length,
      atomic_prompts: pack.facts.length,
      per_page_prompts: byPage.size,
      property_brief_prompts: 1,
      root,
    },
    null,
    2
  )
);
