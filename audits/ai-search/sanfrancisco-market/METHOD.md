# Method — San Francisco Market Street track

Defaults from smoke gates (see `smoke/` notes and [docs/ai-search-conflict-provenance.md](../../docs/ai-search-conflict-provenance.md)).

| Knob | Default |
| --- | --- |
| Model | `gpt-5.6-luna`, effort `medium` |
| Shape | Atomic prompts |
| Repeats | 5 per fact |
| Ops signal | `ever_contradicts` + unioned `contradicting_sources` |

```bash
./audits/ai-search/sanfrancisco-market/smoke/run-luna-atomic-x5.sh
```

Rough cost: **~$0.07 per fact** for Luna atomic ×5 (OpenAI `web_search` ~80% of spend). Full Market Street accepted set (~63 facts) ≈ **~$4.40**.
