---
name: fact-db-mcp
description: >-
  Operate the Agent Fact DB MCP: list facts, propose pending claims, record
  source findings, assess, dismiss findings, mark duplicates, and promote
  findings. Use when writing to or reading from the Fact Ledger, cleaning
  duplicate claims, or documenting listing evidence.
---

# Fact DB MCP operations

Namespace: `user-agent-fact-db` (HTTP MCP on the Worker `/agent/mcp`).

## Rules

- Accepted / corrected facts are the SoT. Contested, pending and duplicate are not.
- Agents never accept / correct / contest via the admin review API through MCP.
- Exception: `mark_fact_duplicate` updates authoritative status (requires `facts:assess`).
- Findings and assessments are evidence; they do not flip approval by themselves.
- Quotes must be real page or listing field content, not paraphrases.

## Tools and scopes

| Tool | Scope | Mutates SoT? |
| --- | --- | --- |
| `list_fact_lists` | `facts:read` | No |
| `get_facts` | `facts:read` | No |
| `list_pages` | `facts:read` | No |
| `record_source_finding` | `evidence:write` | No |
| `list_source_findings` | `evidence:read` | No |
| `dismiss_source_finding` | `evidence:write` | No |
| `propose_fact` | `facts:propose` | Creates **pending** only |
| `assign_facts_to_page` | `facts:propose` | Page link only |
| `promote_source_finding` | `facts:propose` | Creates **pending** only |
| `assess_fact` | `facts:assess` | No (advisory) |
| `mark_fact_duplicate` | `facts:assess` | Yes → `duplicate` |

If a tool is missing from `tools/list`, the Worker is behind git main — deploy + apply D1 migration `0003_dismiss_and_duplicate` before relying on dismiss/duplicate.

## Patterns

### Read SoT

```
get_facts({ list_id, include_unapproved?: boolean })
```

Default returns `accepted` + `corrected` only.

### Record evidence

```
record_source_finding({
  fact_id, url, quote, party: "first"|"second"|"third",
  verdict: "matches"|"contradicts"|"unclear", notes?
})
```

Party by relationship, not hostname: owned CMS = first; Yext/GBP managed listing = second; independent = third.

### List pages / assign unassigned facts

```
list_pages({ list_id })
// → { pages:[{id,title,url,page_type,fact_count}], unassigned }

assign_facts_to_page({ page_id, fact_ids:["…"] })   // 1–100, same property
assign_facts_to_page({ unassign: true, fact_ids:["…"] })
```

Does not change review status. Prefer matching `source_url` host/path to page URL when choosing a target.

### Propose a gap

```
propose_fact({ list_id, topic, claim, source_url?, notes?, page_id? })
```

One checkable claim per fact. Include `page_id` when the inventory page is known.

### Dismiss noise

```
dismiss_source_finding({ finding_id, notes? })
dismiss_source_finding({ finding_id, restore: true })
```

Dismissed findings stay for audit, leave default lists, cannot be promoted until restored.

### Mark duplicate

```
mark_fact_duplicate({
  fact_id, revision, notes,
  canonical_fact_id?  // same list; not itself; not already duplicate
})
```

Requires current `revision` (409 if stale). Accepting later in the UI clears `duplicate_of`.

If the tool is unavailable, record `assess_fact` with `contest` naming the canonical `fact_id`, and note that status=`duplicate` still needs deploy or admin UI.

### Assess without changing status

```
assess_fact({ fact_id, assessment: "confirm"|"contest", notes })
```

Notes are mandatory.

## Party cheat sheet

| Source | Typical party |
| --- | --- |
| fourseasons.com / press.fourseasons.com | first |
| Yext entity fields | second |
| Google Business Profile via DataForSEO/Yext listings | second |
| OpenTable / TripAdvisor / news | third |

## Related

- Full property audit workflow: [property-fact-audit](../property-fact-audit/SKILL.md)
