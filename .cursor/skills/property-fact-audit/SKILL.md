---
name: property-fact-audit
description: >-
  Audit hotel, dining and spa claims for a property against Fact DB SoT,
  first-party pages, Yext entities and Google Business Profile. Use when the
  user asks to fact-check a property, compare listings, fill Fact DB gaps,
  check dining/spa/hotel NAP or hours, or run a Yext/GMB overlap review.
---

# Property fact audit

Systematise SoT vs listing checks for one property (or a small set).

## Tools

| Surface | MCP / source |
| --- | --- |
| SoT + findings | `user-agent-fact-db` |
| Knowledge graph / listings | `user-yext` |
| Live GBP snapshot | `user-dataforseo` `business_data/google/my_business_info/live` (fallback: SerpApi Maps) |
| Owned pages | WebFetch / browser on `fourseasons.com` and press hosts |

If Fact DB is `loading`, call `mcp_auth` then retry. If Yext `entities__listEntities` fails schema validation, use `listings__listListings` + `entities__getEntity` with known IDs.

## Checklist

Copy and tick:

```
Audit progress:
- [ ] 1. Resolve Fact DB list_id(s)
- [ ] 2. list_pages; assign unassigned facts when source_url maps cleanly
- [ ] 3. Load accepted facts (and include_unapproved for pending gaps)
- [ ] 4. Map Yext entities (hotel + dining + spa/closed)
- [ ] 5. Pull GBP for hotel and each dining/spa listing
- [ ] 6. Fetch first-party dining / spa / contact pages
- [ ] 7. Compare NAP, hours, categories, website paths
- [ ] 8. record_source_finding (quote + party + verdict)
- [ ] 9. propose_fact for gaps; assess_fact confirm/contest
- [ ] 10. Flag duplicates; dismiss noisy findings
- [ ] 11. Summarise matches, contradictions, pending human actions
```

## Workflow

### 1. SoT baseline

1. `list_fact_lists` → pick property list(s).
2. `get_facts` with `list_id` (add `include_unapproved: true` when reviewing gaps).
3. Group facts by topic class: NAP, dining, spa/fitness, hours, phones.

### 2. Yext entity map

Four Seasons pattern (folder code ≈ property code):

| Role | ID pattern | Example |
| --- | --- | --- |
| Hotel | `{CODE}1` | `SFR1`, `EMB1` |
| Dining / F&B | `{CODE}2+` | `SFR2` MKT, `EMB3` Orafo |
| Closed F&B | still numbered | `EMB2` Sky Deck Bar - CLOSED |

1. `folders__listFolders` if the code is unknown.
2. `listings__listListings` with `locationIds` like `SFR1,SFR2,...` and `publisherIds: GOOGLEMYBUSINESS`.
3. `entities__getEntity` for each hit; capture `name`, `address`, `mainPhone`, `websiteUrl`, `hours`, `meta.entityType`.
4. Note listing `statusDetails` (Confirm Sync, photo warnings, publisher limits).

### 3. Google Business Profile

For each hotel/dining/spa:

- DataForSEO live my business info with property-qualified keyword + city location.
- Compare to Yext and SoT: title, address, phone, url, hours, hotel_rating, directory children.

Party: Yext and GBP are usually `second` (managed listings). Owned site/press are `first`.

### 4. First-party pages

Always fetch the current dining and spa URLs (do not trust teasers alone). Prefer:

- `…/dining/`, venue detail pages, `…/spa/`, `…/contact-us/`, press hotel-facts.

Hours on venue pages often beat flattened Yext/GBP windows.

### 5. Write to Fact DB

| Situation | Action |
| --- | --- |
| Listing agrees with accepted claim | `record_source_finding` verdict `matches` + optional `assess_fact` `confirm` |
| Listing disagrees | `record_source_finding` `contradicts` with exact quote; do **not** change approval via assess alone |
| Missing SoT claim | `propose_fact` (pending) |
| Redundant accepted claims | `mark_fact_duplicate` when available; else `assess_fact` `contest` naming the canonical `fact_id` |
| Useless finding | `dismiss_source_finding` |

`assess_fact` never changes authoritative status. `mark_fact_duplicate` does (requires `facts:assess` and current `revision`).

### 6. Report format

```markdown
## [Property] audit

### Entities
| ID | Type | Name | Notes |

### Matches
- …

### Contradictions
- … (SoT vs source; proposed fix)

### Gaps (pending facts)
- …

### Human actions
- Accept / correct / duplicate / listing sync …
```

## Topic routing

| Topic | Check first | Then |
| --- | --- | --- |
| Name, address, main phone | Homepage + Yext hotel + GBP | Contact / press |
| Dining name / phone / URL | Yext restaurant + venue page | GBP + dining index |
| Dining hours | Venue page | Yext/GBP (often flattened) |
| Spa | Spa page + Yext spa entity if any | Amenities / Equinox partner |
| Hotel class stars | GBP `hotel_rating` | Propose pending if absent from SoT |

## Anti-patterns

- Do not treat contested or duplicate facts as SoT.
- Do not approve facts via MCP; only propose / find / assess / mark duplicate.
- Do not invent Yext IDs beyond probed `{CODE}{n}` or listing results.
- Do not collapse restaurant vs bar hours into one claim when the site splits them.
- Prefer one checkable assertion per fact.

## Related

- Tool semantics: [fact-db-mcp](../fact-db-mcp/SKILL.md)
- Architecture notes: [fact-verification-at-scale.md](../../../docs/fact-verification-at-scale.md)
