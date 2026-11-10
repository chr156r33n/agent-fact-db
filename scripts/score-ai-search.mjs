#!/usr/bin/env node
/**
 * Score smoke/scale AI-search result JSON files.
 * Usage: node scripts/score-ai-search.mjs <results-dir> [pack.json]
 */
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const resultsDir = process.argv[2];
const packPath = process.argv[3];
if (!resultsDir) {
  console.error('Usage: node scripts/score-ai-search.mjs <results-dir> [pack.json]');
  process.exit(1);
}

const pack = packPath ? JSON.parse(readFileSync(packPath, 'utf8')) : null;
const expectedIds = pack ? new Set(pack.facts.map((f) => f.id)) : null;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.json') && name !== 'scorecard.json' && name !== 'triage.json') out.push(p);
  }
  return out;
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

function scoreFile(path) {
  const raw = readFileSync(path, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { path, json_ok: false, error: String(e.message), results: [] };
  }
  const results = Array.isArray(data.results) ? data.results : [];
  const chars_in = data.metrics?.input_chars ?? null;
  const chars_out = data.metrics?.output_chars ?? raw.length;
  const tool_rounds = data.metrics?.search_tool_rounds ?? null;
  const turns = data.metrics?.turns ?? 1;
  const wall_ms = data.metrics?.wall_ms ?? null;

  let empty_contradict_sources = 0;
  let contradict_source_counts = [];
  for (const r of results) {
    const sources = (r.contradicting_sources || []).map(normaliseUrl);
    r.contradicting_sources = [...new Set(sources)];
    if (r.verdict === 'contradicts') {
      contradict_source_counts.push(r.contradicting_sources.length);
      if (!r.contradicting_sources.length) empty_contradict_sources += 1;
    }
  }

  return {
    path,
    method: data.method || null,
    json_ok: true,
    turns,
    output_chars: chars_out,
    input_chars: chars_in,
    tool_rounds,
    wall_ms,
    facts_answered: results.length,
    fact_ids: results.map((r) => r.fact_id),
    verdicts: Object.fromEntries(
      ['matches', 'contradicts', 'unclear', 'not_found'].map((v) => [
        v,
        results.filter((r) => r.verdict === v).length,
      ])
    ),
    empty_contradict_sources,
    sources_per_contradict:
      contradict_source_counts.length === 0
        ? null
        : contradict_source_counts.reduce((a, b) => a + b, 0) / contradict_source_counts.length,
    results,
  };
}

const files = walk(resultsDir);
const scored = files.map(scoreFile);

function aggregate(method, rows) {
  const ok = rows.filter((r) => r.json_ok);
  const ids = new Set(ok.flatMap((r) => r.fact_ids));
  const completeness =
    expectedIds && expectedIds.size
      ? [...expectedIds].filter((id) => ids.has(id)).length / expectedIds.size
      : null;
  const contradicts = ok.flatMap((r) => r.results.filter((x) => x.verdict === 'contradicts'));
  const srcCounts = contradicts.map((c) => (c.contradicting_sources || []).length);
  return {
    method,
    files: rows.length,
    json_ok_files: ok.length,
    turns: ok.reduce((a, r) => a + (r.turns || 0), 0),
    output_chars: ok.reduce((a, r) => a + (r.output_chars || 0), 0),
    input_chars: ok.every((r) => r.input_chars != null)
      ? ok.reduce((a, r) => a + r.input_chars, 0)
      : null,
    tool_rounds: ok.every((r) => r.tool_rounds != null)
      ? ok.reduce((a, r) => a + r.tool_rounds, 0)
      : null,
    wall_ms: ok.every((r) => r.wall_ms != null) ? ok.reduce((a, r) => a + r.wall_ms, 0) : null,
    facts_answered: ids.size,
    completeness,
    empty_contradict_sources: ok.reduce((a, r) => a + r.empty_contradict_sources, 0),
    sources_per_contradict:
      srcCounts.length === 0 ? null : srcCounts.reduce((a, b) => a + b, 0) / srcCounts.length,
    contradict_count: contradicts.length,
  };
}

const byMethod = {};
for (const s of scored) {
  const m = s.method || 'unknown';
  (byMethod[m] ||= []).push(s);
}

const table = Object.entries(byMethod).map(([method, rows]) => aggregate(method, rows));
const scorecard = {
  generated_at: new Date().toISOString(),
  results_dir: resultsDir,
  expected_facts: expectedIds ? expectedIds.size : null,
  table,
  files: scored.map(({ results, ...rest }) => rest),
};

writeFileSync(join(resultsDir, 'scorecard.json'), JSON.stringify(scorecard, null, 2));
console.log(JSON.stringify(table, null, 2));
