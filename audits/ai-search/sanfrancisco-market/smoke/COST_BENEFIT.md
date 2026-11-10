# Smoke cost / benefit (measured)

Property: Four Seasons Hotel San Francisco  
Sample: Hotel Overview + Contact Us (12 accepted facts)  
Model proxy: Cursor GPT-5.6 + web search (stand-in for Instant ChatGPT + search)

| Approach | Turns | Input chars | Output chars | Tool rounds | Wall (est.) | Completeness | Contradicts | Sources / contradict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Atomic | 12 | 12 900 | 8 983 | 17 | ~360 s | 100% | 1 | **4.0** |
| Per-page | 2 | 3 686 | 7 441 | 13 | ~150 s | 100% | **0** | — |
| Property brief | 1 | 3 188 | 7 500 | 14 | ~90 s | 100% | 1 | 1.0 |

## Decision

**Default method: atomic.**

- Atomic found the building-floor conflict and returned four contradicting URLs (Wikipedia, SkyDB, CTBUH, Hospitality Net).
- Per-page was cheaper on chars/turns but **missed the contradict** (false negative for provenance).
- Property brief found the contradict but only one source — too thin for “all sources.”

Atomic costs more turns and input chars; tool rounds were only modestly higher (17 vs 13–14). For this goal, provenance richness beats turn savings.

Optional follow-up: after atomic flags a contradict, a single “list every URL that states X” refresh if the source list looks thin.
