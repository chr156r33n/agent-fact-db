# AI search conflict provenance

Smoke and scale audits that compare approved Fact DB claims to web-grounded model answers, collecting **every** contradicting URL (domain + path).

Canonical write-up (method, costs, local inference): [docs/ai-search-conflict-provenance.md](../docs/ai-search-conflict-provenance.md).

Prompt contract: [PROMPT_CONTRACT.md](PROMPT_CONTRACT.md).

## Layout

```
audits/ai-search/<property>/
  METHOD.md                # locked defaults for this property track
  triage.md / triage.json  # conflict table
  smoke/pack.json          # fixed fact sample
  smoke/prompts/…          # generated prompts
  smoke/results/…          # model JSON + scorecards
  smoke/*.md               # cost / stability notes
  scale/…                  # post-gate scale runs
```

Example property folder: [sanfrancisco-market/](sanfrancisco-market/).

## Commands

```bash
# Build prompts from a pack
node scripts/build-ai-search-prompts.mjs audits/ai-search/sanfrancisco-market/smoke/pack.json

# OpenAI Responses + web_search (requires OPENAI_API_KEY in the environment)
node scripts/run-ai-search-openai.mjs \
  --prompts-dir audits/ai-search/sanfrancisco-market/smoke/prompts/atomic \
  --out audits/ai-search/sanfrancisco-market/smoke/results/openai-luna/atomic-x5.json \
  --method atomic --model gpt-5.6-luna --effort medium --repeats 5 --retries 5

# Or the helper script
./audits/ai-search/sanfrancisco-market/smoke/run-luna-atomic-x5.sh

# Score a results folder against the pack
node scripts/score-ai-search.mjs \
  audits/ai-search/sanfrancisco-market/smoke/results/openai-luna \
  audits/ai-search/sanfrancisco-market/smoke/pack.json
```

Do not commit API keys. `.env` / `.cursor/mcp.json` stay gitignored.
