#!/usr/bin/env node
/**
 * Run AI-search smoke/scale prompts against OpenAI Responses API.
 * Captures real usage tokens. Supports --repeats N (default 1).
 *
 * Usage:
 *   OPENAI_API_KEY=... node scripts/run-ai-search-openai.mjs \
 *     --prompts-dir audits/.../prompts/atomic \
 *     --out audits/.../results/openai-atomic.json \
 *     --method atomic \
 *     [--model gpt-5.6-luna] [--effort medium] [--repeats 5]
 *
 * With --repeats > 1: each prompt file is called N times. Output includes:
 *   - trials[] raw per-call result rows (with trial index)
 *   - results[] aggregated per fact_id (majority verdict, unioned sources, stability)
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const promptsDir = arg('--prompts-dir');
const outPath = arg('--out');
const method = arg('--method', 'atomic');
const model = arg('--model', 'gpt-5.6-sol');
const effort = arg('--effort', 'medium');
const property = arg('--property', 'Four Seasons Hotel San Francisco');
const repeats = Math.max(1, Number(arg('--repeats', '1')) || 1);
const maxAttempts = Math.max(1, Number(arg('--retries', '5')) || 5);
const apiKey = process.env.OPENAI_API_KEY;

if (!promptsDir || !outPath) {
  console.error('Need --prompts-dir and --out');
  process.exit(1);
}
if (!apiKey) {
  console.error('OPENAI_API_KEY is not set');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err, status) {
  if (status === 429 || (status >= 500 && status <= 599)) return true;
  const msg = String(err?.cause?.code || err?.code || err?.message || err);
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|socket|network/i.test(msg);
}

function listTxt(dir) {
  return readdirSync(dir)
    .filter((n) => n.endsWith('.txt'))
    .sort()
    .map((n) => join(dir, n));
}

function extractJson(text) {
  if (!text) throw new Error('Empty model text');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('Could not parse JSON from model output');
  }
}

function outputText(response) {
  if (typeof response.output_text === 'string' && response.output_text) return response.output_text;
  const parts = [];
  for (const item of response.output || []) {
    if (item.type === 'message') {
      for (const c of item.content || []) {
        if (c.type === 'output_text' || c.type === 'text') parts.push(c.text || '');
      }
    }
  }
  return parts.join('\n').trim();
}

function countSearchRounds(response) {
  let n = 0;
  for (const item of response.output || []) {
    const t = item.type || '';
    if (t.includes('web_search') || t === 'web_search_call') n += 1;
  }
  return n;
}

function normaliseUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    [...x.searchParams.keys()]
      .filter((k) => /^(utm_|fbclid|gclid|mc_)/i.test(k) || k === 'si')
      .forEach((k) => x.searchParams.delete(k));
    const q = x.searchParams.toString();
    return `${x.origin}${x.pathname}${q ? `?${q}` : ''}`.replace(/\/$/, '') || x.origin;
  } catch {
    return String(u || '').split('?')[0];
  }
}

async function callOpenAIOnce(prompt) {
  const body = {
    model,
    reasoning: { effort },
    tools: [{ type: 'web_search' }],
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ],
  };

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch (e) {
    const err = new Error(`Failed to parse OpenAI JSON (${res.status})`);
    err.cause = e;
    err.status = res.status;
    throw err;
  }
  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    const err = new Error(`OpenAI ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function callOpenAI(prompt) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callOpenAIOnce(prompt);
    } catch (err) {
      lastErr = err;
      const status = err.status;
      if (!isRetryable(err, status) || attempt === maxAttempts) throw err;
      const backoff = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      process.stderr.write(
        `  retry ${attempt}/${maxAttempts} after ${err.message || err} (wait ${backoff}ms)\n`
      );
      await sleep(backoff);
    }
  }
  throw lastErr;
}

function aggregateByFact(trials) {
  const byId = new Map();
  for (const row of trials) {
    if (!row.fact_id) continue;
    if (!byId.has(row.fact_id)) byId.set(row.fact_id, []);
    byId.get(row.fact_id).push(row);
  }

  const aggregated = [];
  for (const [fact_id, rows] of byId) {
    const verdictCounts = {};
    const sources = new Set();
    const cited = new Set();
    const answers = [];
    for (const r of rows) {
      const v = r.verdict || 'unclear';
      verdictCounts[v] = (verdictCounts[v] || 0) + 1;
      for (const u of r.contradicting_sources || []) sources.add(normaliseUrl(u));
      for (const u of r.cited_urls || []) cited.add(normaliseUrl(u));
      if (r.model_answer) answers.push(r.model_answer);
    }
    const ranked = Object.entries(verdictCounts).sort((a, b) => b[1] - a[1]);
    const majority = ranked[0][0];
    const majority_n = ranked[0][1];
    const stable = majority_n === rows.length;
    const ever_contradicts = (verdictCounts.contradicts || 0) > 0;
    aggregated.push({
      fact_id,
      model_answer: answers[0] || '',
      verdict: majority,
      verdict_counts: verdictCounts,
      trials: rows.length,
      stability: majority_n / rows.length,
      stable,
      ever_contradicts,
      contradict_rate: (verdictCounts.contradicts || 0) / rows.length,
      cited_urls: [...cited],
      contradicting_sources: [...sources],
      notes: stable
        ? `Stable ${majority} across ${rows.length} trials`
        : `Unstable across ${rows.length} trials: ${JSON.stringify(verdictCounts)}; ever_contradicts=${ever_contradicts}`,
    });
  }
  return aggregated;
}

const files = listTxt(promptsDir);
if (!files.length) {
  console.error('No .txt prompts in', promptsDir);
  process.exit(1);
}

function doneKey(file, trial) {
  return `${file}::${trial}`;
}

function loadCheckpoint() {
  try {
    const prev = JSON.parse(readFileSync(outPath, 'utf8'));
    if (!prev || prev.model !== model || prev.effort !== effort || prev.repeats !== repeats) {
      process.stderr.write(`Ignoring incompatible checkpoint at ${outPath}\n`);
      return null;
    }
    return prev;
  } catch {
    return null;
  }
}

const checkpoint = loadCheckpoint();
const started = Date.now();
const trials = checkpoint?.trials ? [...checkpoint.trials] : [];
let inputTokens = checkpoint?.metrics?.input_tokens || 0;
let outputTokens = checkpoint?.metrics?.output_tokens || 0;
let totalTokens = checkpoint?.metrics?.total_tokens || 0;
let reasoningTokens = checkpoint?.metrics?.reasoning_tokens || 0;
let searchRounds = checkpoint?.metrics?.search_tool_rounds || 0;
let inputChars = checkpoint?.metrics?.input_chars || 0;
const callMeta = checkpoint?.calls ? [...checkpoint.calls] : [];
const completed = new Set(
  (checkpoint?.calls || []).map((c) => doneKey(c.file, c.trial)).filter(Boolean)
);
if (completed.size) {
  process.stderr.write(`Resuming ${outPath}: ${completed.size} completed trial calls\n`);
}

function writePartial() {
  const aggregated = aggregateByFact(trials);
  const unstable = aggregated.filter((r) => !r.stable).length;
  const everContra = aggregated.filter((r) => r.ever_contradicts).length;
  const out = {
    method,
    property,
    model,
    effort,
    repeats,
    partial: true,
    results: aggregated,
    trials,
    metrics: {
      turns: callMeta.length,
      prompts: files.length,
      repeats,
      search_tool_rounds: searchRounds,
      input_chars: inputChars,
      output_chars: JSON.stringify(aggregated).length,
      wall_ms: Date.now() - started + (checkpoint?.metrics?.wall_ms || 0),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      reasoning_tokens: reasoningTokens,
      facts: aggregated.length,
      unstable_facts: unstable,
      facts_ever_contradict: everContra,
      notes: `OpenAI Responses API model=${model} effort=${effort} web_search=on repeats=${repeats} (partial checkpoint)`,
    },
    calls: callMeta,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
}

for (const file of files) {
  const prompt = readFileSync(file, 'utf8');
  for (let trial = 1; trial <= repeats; trial++) {
    if (completed.has(doneKey(file, trial))) {
      process.stderr.write(`skip ${file} trial ${trial}/${repeats} (checkpoint)\n`);
      continue;
    }
    inputChars += prompt.length;
    process.stderr.write(`→ ${file} trial ${trial}/${repeats} (${prompt.length} chars)\n`);
    const t0 = Date.now();
    const response = await callOpenAI(prompt);
    const text = outputText(response);
    const parsed = extractJson(text);
    const results = Array.isArray(parsed.results) ? parsed.results : parsed.fact_id ? [parsed] : [];
    for (const r of results) {
      trials.push({ ...r, trial, prompt_file: file });
    }

    const u = response.usage || {};
    const inTok = u.input_tokens ?? u.prompt_tokens ?? 0;
    const outTok = u.output_tokens ?? u.completion_tokens ?? 0;
    const tot = u.total_tokens ?? inTok + outTok;
    const reasonTok = u.output_tokens_details?.reasoning_tokens ?? u.reasoning_tokens ?? 0;
    inputTokens += inTok;
    outputTokens += outTok;
    totalTokens += tot;
    reasoningTokens += reasonTok;
    const rounds = countSearchRounds(response);
    searchRounds += rounds;

    callMeta.push({
      file,
      trial,
      id: response.id,
      model: response.model || model,
      ms: Date.now() - t0,
      input_tokens: inTok,
      output_tokens: outTok,
      total_tokens: tot,
      reasoning_tokens: reasonTok,
      search_tool_rounds: rounds,
      facts: results.length,
    });
    completed.add(doneKey(file, trial));
    process.stderr.write(
      `  ok facts=${results.length} tokens in/out/total=${inTok}/${outTok}/${tot} search=${rounds}\n`
    );
    writePartial();
  }
}

const aggregated = aggregateByFact(trials);
const unstable = aggregated.filter((r) => !r.stable).length;
const everContra = aggregated.filter((r) => r.ever_contradicts).length;

const out = {
  method,
  property,
  model,
  effort,
  repeats,
  partial: false,
  results: aggregated,
  trials,
  metrics: {
    turns: callMeta.length,
    prompts: files.length,
    repeats,
    search_tool_rounds: searchRounds,
    input_chars: inputChars,
    output_chars: JSON.stringify(aggregated).length,
    wall_ms: Date.now() - started + (checkpoint?.metrics?.wall_ms || 0),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    reasoning_tokens: reasoningTokens,
    facts: aggregated.length,
    unstable_facts: unstable,
    facts_ever_contradict: everContra,
    notes: `OpenAI Responses API model=${model} effort=${effort} web_search=on repeats=${repeats}`,
  },
  calls: callMeta,
};

writeFileSync(outPath, JSON.stringify(out, null, 2));
process.stderr.write(`Wrote ${outPath} (aggregated ${aggregated.length} facts, unstable ${unstable}, ever_contradicts ${everContra})\n`);
console.log(JSON.stringify(out.metrics, null, 2));
