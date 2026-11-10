# AI search audit prompt contract

Use for atomic, per-page, and property-brief methods.

## Task

You are checking what web search currently says versus our approved source-of-truth (SoT) claims for a hotel property.

Use web search. Answer each claim independently. Return **JSON only** (no markdown fences, no prose outside JSON).

## Output schema

Top-level object:

```json
{
  "method": "atomic|per-page|property-brief",
  "property": "string",
  "results": [ /* one object per fact */ ],
  "metrics": {
    "search_tool_rounds": 0,
    "notes": "optional operator notes"
  }
}
```

Each result object:

| Field | Rule |
| --- | --- |
| `fact_id` | Exact id from the prompt |
| `model_answer` | Short answer as search currently supports |
| `verdict` | `matches` \| `contradicts` \| `unclear` \| `not_found` |
| `cited_urls` | All URLs used for this claim (domain + path; strip tracking params) |
| `contradicting_sources` | If `contradicts`: **every** URL that states the conflicting value (domain + path). Else `[]`. Do not keep only the top hit. Do not omit third-party or listing URLs. |
| `notes` | Ambiguity / why |

A `contradicts` row with empty `contradicting_sources` is incomplete — search again and list every supporting URL.
