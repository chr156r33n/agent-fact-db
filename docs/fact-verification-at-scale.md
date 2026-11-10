# Fact verification at scale

Notes for later. Day-to-day property audits are systematised in project skills:

- `.cursor/skills/property-fact-audit/SKILL.md` — hotel / dining / spa checks across Fact DB, first-party pages, Yext and GBP
- `.cursor/skills/fact-db-mcp/SKILL.md` — Fact Ledger MCP tool semantics (propose, findings, dismiss, duplicate)
- [ai-search-conflict-provenance.md](ai-search-conflict-provenance.md) — web-grounded model checks vs SoT (Luna atomic ×5, costs, local inference notes)

The current workflow can still be **ad hoc**: a curated list of URLs plus an agent that reads accepted facts, inspects pages, and records source findings. This document captures the design to use if and when verification needs to run on a schedule across many properties, subdomains and Google Business Profiles.

## Goal

Maintain an approved source of truth (SoT) in the Fact Ledger, then identify inconsistencies on owned websites and Google Business Profile (GMB) listings.

The Fact Ledger already supports this loop:

1. Human accepts or corrects facts.
2. Agents inspect live sources and call `record_source_finding` with a real quote, party and verdict (`matches` / `contradicts` / `unclear`).
3. Humans resolve contradicts (fix the site, correct the fact, or leave contested).

Agent assessments never change authoritative approval state.

## Current approach (keep for now)

- Seed properties with homepage, accommodations and press fact-sheet URLs (see `*-facts.json` and `import-facts.mjs`).
- Use an agent with Fact DB MCP (`get_facts`, `record_source_finding`, `assess_fact`).
- Pass an explicit URL list per audit rather than crawling everything.
- Prefer one checkable assertion per fact (avoid compound or double-counted claims).

This is enough while property count and audit frequency stay modest.

## Why not a full crawl or a triple store

**Full-site crawl then NLP-match every paragraph to every fact** invents noise and cost. The SoT already defines what to verify.

**Semantic triples (subject–predicate–object)** help cross-property analytics and entity graphs. They are a weak fit for human-reviewed prose claims and for “is this page wrong vs SoT?” For inconsistency detection, keep free-text claims as the review unit. Optionally add a light structured overlay later (`entity`, controlled `predicate`, `object`) or project triples from *accepted* claims — do not replace claims with RDF as the source of truth.

The graph that matters for audits is already available relationally:

`Property → Page → Fact ← Finding (url, party, verdict)`

## Target architecture when scheduling / staleness matter

Invert the problem: **fact-driven checks against a surface registry**, not crawl-driven fact discovery.

```
Accepted facts (SoT)
        ↓
Surface registry per property
  - owned: primary site, press, other high-value hosts
  - Google Business Profile (place_id)
        ↓
Topic → surface routing
  (only fetch pages that can answer the claim)
        ↓
Fetch → extract → compare → record_source_finding
```

### Surface registry

Per property, maintain durable surfaces (extend `pages` or add a related table later):

| Surface | Example | Party |
| --- | --- | --- |
| Primary site | `https://www.fourseasons.com/maui/` | first |
| Press | `https://press.fourseasons.com/maui/` | first |
| Other owned hosts | bookings, spa microsites, etc. | first |
| Google Business Profile | Maps URL / `place_id` | second* |

\*GMB is usually operator-controlled but not the property CMS. Prefer `second` unless the relationship is clearly first-party via GBP Manager ownership.

**Discovery (occasional, not every audit):**

- Owned URL inventory: Lumar or equivalent site crawl / SerpApi map — store templates in the registry, do not re-judge every URL every run.
- Subdomains: enumerate (DNS / CT / crawl seeds), classify, map only high-value templates. Avoid recursively crawling every subdomain forever.
- GMB: resolve and store `place_id` via SerpApi or DataForSEO Maps/business APIs. Do not scrape the Maps UI at scale. Knowledge Graph alone is not enough for NAP.

### Topic → surface routing

| Topic class | Check first | Then |
| --- | --- | --- |
| Name, address, phone | Homepage + GMB | Press / contact |
| Hours / check-in / check-out | Accommodations policies | GMB hours |
| Room counts / sizes | Press fact sheet | Accommodations |
| Dining names | Press + dining | Homepage teasers |
| Amenities | Press / amenities | GMB attributes (sparse) |

One accepted fact should typically drive **1–3 fetches**, not every URL on every subdomain.

### Extraction and comparison

1. **Deterministic extractors** for NAP, phones, times, counts (regex, schema.org / JSON-LD, GBP structured fields).
2. **LLM compare** only when wording is fuzzy or a quote must be selected carefully.
3. Always store a **verbatim quote** with the finding. Snippets alone are insufficient for review.

### Pipeline shape

Prefer a batch worker or queue over one-off chat sessions:

1. Load accepted/corrected facts for a property.
2. Resolve candidate URLs from registry + topic routing.
3. Fetch with cache keyed by `url + content-hash` (skip unchanged pages).
4. Extract candidates and decide verdict.
5. Write `record_source_finding` (party + quote + verdict + notes).
6. Human queue: open `contradicts` (especially first-party), then `unclear`.

### Subdomains: what “all” should mean

1. Enumerate subdomains.
2. Classify (marketing / booking / press / low-value).
3. Map high-value templates into the surface registry.
4. Recrawl those templates on a schedule.
5. Spot-check the long tail mainly for NAP / footer consistency.

Deep amenity copy on obscure hosts is rarely the SoT conflict surface; footer NAP drift often is.

### Google Business Profile

Store per property: `place_id`, canonical Maps URL, and last snapshot of name, address, phone, hours, website.

Verify only topics GMB actually carries (typically NAP, hours, website URL). Do not expect room sizes or executive chef names there.

### Prioritisation (staleness)

Recheck in this order:

1. Facts with prior `contradicts`.
2. High-severity topics (NAP, hours, legal / property names).
3. Facts with no finding in N days.
4. Pages whose content-hash changed.
5. Everything else on a slower cadence.

Unchanged page + recent `matches` → skip.

### Suggested tooling split

| Layer | Tooling |
| --- | --- |
| SoT + findings | Agent Fact DB MCP |
| Owned URL inventory | Lumar (or SerpApi map / crawl) |
| Page fetch / extract | Own fetcher or SerpApi `extract` |
| GMB / Maps | SerpApi or DataForSEO |
| Compare + write findings | Batch worker → `record_source_finding` |

## What not to do

- Crawl the entire estate, then try to match every paragraph to every fact.
- Ask a model to “read the site and find errors” without SoT anchors.
- Treat every subdomain page as equal priority.
- Expect GMB to validate press-sheet-only facts.
- Replace human-reviewed claims with a rigid triple schema just to enable a graph UI.

## Graduation criteria

Consider leaving pure ad hoc audits when any of these become painful:

- Many properties or frequent re-audits.
- Repeated re-fetch of unchanged pages.
- Need for GMB + multi-host coverage every cycle.
- Need for a durable “open contradicts” operations queue.

First incremental build: surface registry (`pages` + `place_id`) and topic routing rules, then a batch auditor that only writes findings. Defer graph / triple work unless cross-property entity analytics become a real requirement.

## Related

- README: Source verification workflow and MCP tools.
- Inventory UI: property / page assignment and bulk human review.
- Seed examples: `maui-facts.json`, `sanfrancisco-facts.json`, `embarcadero-facts.json`.
- Portfolio hydration: [fs-portfolio-hydration.md](fs-portfolio-hydration.md) (discover → seed → import → Yext/GBP audit).
