#!/usr/bin/env node
/**
 * Scan Provenance via MCP: mark clear topic duplicates, confirm remaining
 * pending facts that are not contested/duplicate. assess_fact is advisory —
 * it does not flip human review status to accepted.
 */
import {readFileSync} from 'node:fs';

const MCP_URL = process.env.FACT_DB_MCP_URL || 'https://agent-fact-db.cgworker.workers.dev/agent/mcp';
const TOKEN = process.env.FACT_DB_MCP_TOKEN || (() => {
  try {
    const cfg = JSON.parse(readFileSync('.cursor/mcp.json', 'utf8'));
    const h = cfg.mcpServers?.['agent-fact-db']?.headers?.Authorization || '';
    return h.replace(/^Bearer\s+/i, '');
  } catch {
    return '';
  }
})();
if (!TOKEN) throw new Error('Set FACT_DB_MCP_TOKEN or configure .cursor/mcp.json');

const DRY = process.argv.includes('--dry-run');
const LIMIT = Number(process.env.LIST_LIMIT || 0) || 0;
let rpcId = 1;

async function rpc(name, args = {}) {
  const r = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: rpcId++,
      method: 'tools/call',
      params: {name, arguments: args},
    }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`${name} HTTP ${r.status}: ${JSON.stringify(body)}`);
  if (body.error) throw new Error(`${name} RPC: ${JSON.stringify(body.error)}`);
  if (body.result?.isError) {
    const msg = body.result.content?.[0]?.text || JSON.stringify(body.result);
    throw new Error(`${name} tool error: ${msg}`);
  }
  const text = body.result?.content?.[0]?.text;
  if (text == null) return body.result;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normTopic(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normClaim(c) {
  return String(c || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s+]/gu, '')
    .trim();
}

function claimOverlap(a, b) {
  const na = normClaim(a);
  const nb = normClaim(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // digit-heavy claims (phones, sizes): require shared significant token
  const digitsA = na.match(/\d+/g)?.join('') || '';
  const digitsB = nb.match(/\d+/g)?.join('') || '';
  if (digitsA && digitsB && digitsA === digitsB) return true;
  return false;
}

function rankCanonical(f) {
  const statusRank = {accepted: 4, corrected: 3, pending: 2, contested: 1, duplicate: 0}[f.status] || 0;
  const page = f.page_id ? 1 : 0;
  const len = String(f.approved_claim || f.claim || '').length;
  return statusRank * 1e9 + page * 1e6 + len;
}

function pickGroups(facts) {
  const byTopic = new Map();
  for (const f of facts) {
    if (f.status === 'duplicate') continue;
    const key = normTopic(f.topic);
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key).push(f);
  }
  const dups = [];
  const conflicts = [];
  const clean = [];
  for (const [, group] of byTopic) {
    if (group.length === 1) {
      clean.push(group[0]);
      continue;
    }
    const sorted = [...group].sort((a, b) => rankCanonical(b) - rankCanonical(a));
    const canonical = sorted[0];
    const rest = sorted.slice(1);
    let conflicted = false;
    for (const other of rest) {
      const a = other.approved_claim || other.claim;
      const b = canonical.approved_claim || canonical.claim;
      if (claimOverlap(a, b)) {
        dups.push({canonical, duplicate: other});
      } else {
        conflicted = true;
        conflicts.push({canonical, other});
      }
    }
    if (!conflicted) clean.push(canonical);
    else {
      // leave whole topic for human; still record conflicts
    }
  }
  return {dups, conflicts, clean};
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const lists = await rpc('list_fact_lists');
const selected = LIMIT ? lists.slice(0, LIMIT) : lists;
console.log(`Lists: ${lists.length}; processing ${selected.length}${DRY ? ' (dry-run)' : ''}`);

const summary = {
  lists: 0,
  facts: 0,
  confirmed: 0,
  duplicates_marked: 0,
  conflicts: 0,
  skipped_status: 0,
  errors: [],
};

for (const list of selected) {
  summary.lists++;
  let facts;
  try {
    facts = await rpc('get_facts', {list_id: list.id, include_unapproved: true});
  } catch (e) {
    summary.errors.push({list: list.name, step: 'get_facts', error: String(e.message || e)});
    continue;
  }
  if (!Array.isArray(facts)) {
    summary.errors.push({list: list.name, step: 'get_facts', error: 'unexpected payload'});
    continue;
  }
  summary.facts += facts.length;
  const {dups, conflicts, clean} = pickGroups(facts);
  summary.conflicts += conflicts.length;

  for (const {canonical, duplicate} of dups) {
    if (duplicate.status === 'duplicate') continue;
    const notes = `Duplicate of ${canonical.id} (${canonical.topic}). Same topic with overlapping claim; keep canonical.`;
    if (DRY) {
      console.log(`[dry] duplicate ${list.name} :: ${duplicate.topic} -> ${canonical.id}`);
      summary.duplicates_marked++;
      continue;
    }
    try {
      await rpc('mark_fact_duplicate', {
        fact_id: duplicate.id,
        revision: duplicate.revision,
        notes,
        canonical_fact_id: canonical.id,
      });
      summary.duplicates_marked++;
    } catch (e) {
      summary.errors.push({list: list.name, step: 'mark_fact_duplicate', fact_id: duplicate.id, error: String(e.message || e)});
    }
    await sleep(40);
  }

  for (const {canonical, other} of conflicts) {
    if (DRY) {
      console.log(`[dry] conflict ${list.name} :: ${canonical.topic}`);
      continue;
    }
    // Advisory contest on the lower-ranked claim when both are pending/accepted
    const target = rankCanonical(other) <= rankCanonical(canonical) ? other : canonical;
    if (target.status === 'contested' || target.status === 'duplicate') continue;
    try {
      await rpc('assess_fact', {
        fact_id: target.id,
        assessment: 'contest',
        notes: `Topic "${target.topic}" has conflicting claims in this list (compare ${canonical.id} vs ${other.id}). Needs human resolution before confirm.`,
      });
    } catch (e) {
      summary.errors.push({list: list.name, step: 'assess_fact contest', fact_id: target.id, error: String(e.message || e)});
    }
    await sleep(40);
  }

  for (const f of clean) {
    if (f.status !== 'pending') {
      if (f.status === 'accepted' || f.status === 'corrected') {
        // already SoT; optional confirm skipped to reduce noise
        summary.skipped_status++;
      } else {
        summary.skipped_status++;
      }
      continue;
    }
    const notes = `Confirmed pending seed/import claim with unique topic and no overlapping duplicate in list "${list.name}". First-party source: ${f.source_url || 'n/a'}. Advisory only — human acceptance still required for SoT.`;
    if (DRY) {
      console.log(`[dry] confirm ${list.name} :: ${f.topic}`);
      summary.confirmed++;
      continue;
    }
    try {
      await rpc('assess_fact', {
        fact_id: f.id,
        assessment: 'confirm',
        notes,
      });
      summary.confirmed++;
    } catch (e) {
      summary.errors.push({list: list.name, step: 'assess_fact confirm', fact_id: f.id, error: String(e.message || e)});
    }
    await sleep(40);
  }

  if (summary.lists % 10 === 0) {
    console.log(`… ${summary.lists}/${selected.length} lists; confirmed=${summary.confirmed} dups=${summary.duplicates_marked} conflicts=${summary.conflicts}`);
  }
}

console.log(JSON.stringify(summary, null, 2));
