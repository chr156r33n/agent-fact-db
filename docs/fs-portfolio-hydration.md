# FS portfolio hydration (English hotels & resorts)

Hydrate Fact DB for every open English Four Seasons hotel/resort using the SF seed pattern, then run Yext/GBP listing audits. AI search provenance (Luna atomic ×5) is **out of scope** for this wave — see [ai-search-conflict-provenance.md](ai-search-conflict-provenance.md).

## Pipeline

```text
discover-fs-properties → build-property-seed → import-fs-seeds → human review → listing audit
```

| Step | Script | Output |
| --- | --- | --- |
| Discover | `node scripts/discover-fs-properties.mjs` | [data/fs-properties.json](../data/fs-properties.json) |
| Seed | `node scripts/build-property-seed.mjs --pilot` or `--all-open` | `seeds/{slug}-facts.json` |
| Import | `FACT_DB_URL=… ADMIN_PASSWORD=… node scripts/import-fs-seeds.mjs --pilot` | Pending facts + inventory pages |
| Audit scaffold | `node scripts/run-listing-audit-batch.mjs --pilot` | `audits/listings/{slug}/REPORT.md` |
| Audit execute | Agent following [property-fact-audit](../.cursor/skills/property-fact-audit/SKILL.md) | Findings in Fact DB + filled REPORT |

Optional Yext enrich file: place a hotel-entity dump at `data/yext-hotels-raw.json` before discover to fill `yext_id`, address and phone on the registry.

## Universe

- **In scope:** open hotels/resorts with an English press kit on `press.fourseasons.com/{slug}/` (≈135–140).
- **Exclude:** yachts, private jet, multi-property “by Four Seasons” collection pages, residence-rental-only kits.
- **Existing seeds:** Maui, San Francisco Market, Embarcadero are **enrich-only**; `build-property-seed.mjs` skips them unless `--force-enrich`. Keep the curated root JSON (`maui-facts.json`, `sanfrancisco-facts.json`, `embarcadero-facts.json`).

Registry statuses: `open` → `seeded` (after import) → `audited` (after listing report + findings). Also `skip_residence`, `skip_unopened`.

## Seed shape (SF-compatible)

Same top-level schema as [sanfrancisco-facts.json](../sanfrancisco-facts.json):

```json
{
  "property": "Four Seasons Hotel Chicago",
  "pages": [{ "key": "homepage", "title": "Hotel Overview", "url": "…", "page_type": "General" }],
  "facts": [{ "page_key": "homepage", "topic": "Property name", "claim": "…", "source_url": "…" }]
}
```

Standard pages: homepage, accommodation, amenities, dining, spa (when present), contact, location, hotel-facts.

**Core SoT pack** (machine-extracted from press hotel-facts): property name, address, telephone (when known), opening date, GM, room/suite counts, building configuration, location blurb, architect, spa size/treatment rooms, dining venues, meeting space, pools, fitness size. Room-type square footage is a later depth pass.

Claims stay **pending** until a human accepts or corrects them in the Inventory UI.

## Import

```sh
export FACT_DB_URL="https://agent-fact-db.cgworker.workers.dev/"
export ADMIN_USERNAME="fourseasons"   # or your admin username
export ADMIN_PASSWORD='…'             # never commit

node scripts/import-fs-seeds.mjs --pilot
# after pilot looks good:
node scripts/import-fs-seeds.mjs --all-open

unset ADMIN_PASSWORD
```

[`import-facts.mjs`](../import-facts.mjs) is idempotent: duplicate topic+claim pairs are skipped; page assignments are created when missing.

## Listing audit protocol

Batch ~10 properties per session:

1. Resolve `list_id` via `list_fact_lists`.
2. `list_pages` / assign unassigned facts when `source_url` maps cleanly.
3. Map Yext `{CODE}1` hotel and `{CODE}2+` F&B (folder ≈ property code).
4. GBP via DataForSEO `business_data/google/my_business_info/live` (SerpApi Maps fallback).
5. `record_source_finding` / `propose_fact` for gaps; summarise in `audits/listings/{slug}/REPORT.md`.
6. Mark complete: `node scripts/run-listing-audit-batch.mjs --mark-audited {slug}`.

## Related

- [fact-verification-at-scale.md](fact-verification-at-scale.md) — scheduled verification design
- [ai-search-conflict-provenance.md](ai-search-conflict-provenance.md) — deferred AI provenance wave
- `.cursor/skills/property-fact-audit/SKILL.md` — single-property audit checklist
