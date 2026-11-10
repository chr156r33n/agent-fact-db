# OpenAI smoke — real tokens (`gpt-5.6-sol`, effort `medium`)

Same 12 facts (Hotel Overview + Contact). Web search tool on via Responses API.

| Approach | Turns | Input tok | Output tok | Reasoning tok | Total tok | Search rounds | Wall | Completeness | Contradicts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Atomic | 12 | 178 028 | 6 369 | 3 311 | **184 397** | 15 | ~137 s | 100% | 0 |
| Per-page | 2 | 52 080 | 3 758 | 1 591 | **55 838** | 6 | ~62 s | 100% | 0 |
| Property brief | 1 | 39 157 | 3 703 | 1 826 | **42 860** | 4 | ~53 s | 100% | 0 |

Relative total tokens vs property-brief: per-page **1.3×**, atomic **4.3×**.

## Provenance note

All three methods returned **12/12 matches**. The building-configuration long tail (40 vs 42 storeys) that the earlier Cursor proxy found was **not** surfaced — answers cited current Four Seasons / press / Condé Nast and treated SoT as matching.

So this API smoke is strong on **cost**, weak on **conflict discovery** for this sample (model + prompt preferred corroborating first-party hits).

## Decision update

- For **$/tokens**: prefer **property-brief** or **per-page**, not atomic.
- For **finding contradicting sources**: this run does not reconfirm atomic; keep the earlier proxy lesson that atomic can dig deeper when prompted/searched differently, or add an explicit “also list URLs that disagree” instruction even on matches / a second pass for high-severity NAP claims.
- Practical hybrid: **per-page for sweep cost**, then **atomic re-ask only on unclear / high-severity / thin citation sets**.

Raw metrics: `results/openai/scorecard.json` and per-method `results/openai/*.json` (`usage` rolled into `metrics`).
