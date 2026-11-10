#!/bin/zsh
# Run in a shell where OPENAI_API_KEY works.
# Safe to re-run: checkpoints after each trial and resumes from --out.
set -euo pipefail
cd /Users/chrisgreen/scripts/agent-fact-db
mkdir -p audits/ai-search/sanfrancisco-market/smoke/results/openai-luna
node scripts/run-ai-search-openai.mjs \
  --prompts-dir audits/ai-search/sanfrancisco-market/smoke/prompts/atomic \
  --out audits/ai-search/sanfrancisco-market/smoke/results/openai-luna/atomic-x5.json \
  --method atomic \
  --model gpt-5.6-luna \
  --effort medium \
  --repeats 5 \
  --retries 5
echo DONE_LUNA_ATOMIC_X5
