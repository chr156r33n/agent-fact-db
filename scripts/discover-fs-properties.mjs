#!/usr/bin/env node
/**
 * Discover English Four Seasons hotel/resort press kits and write data/fs-properties.json.
 *
 * Source: https://press.fourseasons.com/content/fourseasons_pressroom/en/properties.html
 * Optional enrich: data/yext-hotels-raw.json (array of Yext hotel entities with websiteUrl).
 *
 * Usage:
 *   node scripts/discover-fs-properties.mjs
 *   node scripts/discover-fs-properties.mjs --probe-pages
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outPath = join(root, 'data', 'fs-properties.json');
const yextPath = join(root, 'data', 'yext-hotels-raw.json');
const PRESS_INDEX =
  'https://press.fourseasons.com/content/fourseasons_pressroom/en/properties.html';
const probePages = process.argv.includes('--probe-pages');

const SKIP_SLUGS = new Set([
  'yachts',
  'jet',
  'hawaiibyfourseasons',
  'chinabyfourseasons',
  'japanbyfourseasons',
  'safari-and-islands-collection-africa',
  'resortsofasia',
  'privacy',
  'legal',
  'cookiepolicy',
  // Press site chrome / sections (not properties)
  'news-releases',
  'hotel-press-kits',
  'trending-now',
  'press-contacts',
  'corporate',
  'image-library',
  'sitemap'
]);

const SKIP_LABEL_RE =
  /residence rental|by four seasons|collection|yachts?|private jet|\bjet\b/i;

const EXISTING_SEEDS = {
  maui: { seed_file: 'maui-facts.json', note: 'enrich-only' },
  sanfrancisco: { seed_file: 'sanfrancisco-facts.json', note: 'enrich-only' },
  embarcadero: { seed_file: 'embarcadero-facts.json', note: 'enrich-only' }
};

const UA =
  'Mozilla/5.0 (compatible; AgentFactDB/1.0; +https://github.com/agent-fact-db)';

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow'
  });
  return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : '' };
}

function extractSlug(href) {
  try {
    const u = new URL(href, 'https://press.fourseasons.com');
    if (!u.hostname.includes('fourseasons.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return null;
    return parts[0].toLowerCase();
  } catch {
    return null;
  }
}

function parsePressIndex(html) {
  const found = new Map();
  const re = /href="(https:\/\/press\.fourseasons\.com\/[^"#]+|\/[a-z0-9_-]+\/?)"[^>]*>([^<]+)</gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const label = m[2].replace(/\s+/g, ' ').trim();
    const slug = extractSlug(href);
    if (!slug || SKIP_SLUGS.has(slug)) continue;
    if (SKIP_LABEL_RE.test(label) && !/hotel|resort|palace|wilshire|ocean club|sensei|naviva|naples|danieli|biltmore/i.test(label)) {
      continue;
    }
    if (!found.has(slug)) {
      found.set(slug, { slug, press_label: label, press_url: `https://press.fourseasons.com/${slug}/` });
    }
  }
  return [...found.values()];
}

function loadYextBySlug() {
  if (!existsSync(yextPath)) return new Map();
  const raw = JSON.parse(readFileSync(yextPath, 'utf8'));
  const map = new Map();
  for (const e of raw) {
    const url = e.websiteUrl?.url || e.websiteUrl || '';
    const match = String(url).match(/fourseasons\.com\/([a-z0-9_-]+)\/?/i);
    if (!match) continue;
    const slug = match[1].toLowerCase();
    const id = e.meta?.id || e.id;
    if (!id || !/1$/.test(id)) continue; // hotel primary entity
    if (String(e.name || '').includes('TEST PROFILE')) continue;
    if (e.closed === true || /CLOSED/i.test(e.name || '')) continue;
    map.set(slug, {
      yext_id: id,
      yext_folder: e.meta?.folderId || null,
      name: e.name,
      address: e.address || null,
      main_phone: e.mainPhone || null,
      website_url: `https://www.fourseasons.com/${slug}/`
    });
  }
  return map;
}

function formatAddress(addr) {
  if (!addr) return null;
  const parts = [
    addr.line1,
    addr.line2,
    [addr.city, addr.region, addr.postalCode].filter(Boolean).join(', '),
    addr.countryCode
  ].filter(Boolean);
  return parts.join(', ');
}

async function classify(entry, yext) {
  const hotelFacts = `https://press.fourseasons.com/${entry.slug}/hotel-facts/`;
  const pressKit = entry.press_url;
  const factsRes = await fetchText(hotelFacts);
  const kitRes = factsRes.ok
    ? { ok: true, status: 200, text: '' }
    : await fetchText(pressKit);

  let statusCode = 'open';
  let note = null;

  if (/northsandiego/i.test(entry.slug) || /residence rental/i.test(entry.press_label)) {
    statusCode = 'skip_residence';
  } else if (!factsRes.ok && !kitRes.ok) {
    statusCode = 'skip_unopened';
  } else if (!factsRes.ok && kitRes.ok) {
    // Press kit exists but hotel-facts not published yet (pipeline / new open).
    note = 'press_kit_without_hotel_facts';
  }

  const y = yext.get(entry.slug);
  let has_spa = null;
  let has_dining = null;

  if (probePages && statusCode === 'open') {
    const spa = await fetchText(pressKit);
    has_spa = /spa/i.test(spa.text);
    has_dining = /dining|restaurant/i.test(spa.text);
  }

  const existing = EXISTING_SEEDS[entry.slug];
  const propertyName =
    y?.name ||
    (entry.press_label.startsWith('Four Seasons')
      ? entry.press_label
      : `Four Seasons — ${entry.press_label}`);

  return {
    slug: entry.slug,
    name: propertyName,
    press_label: entry.press_label,
    site_url: y?.website_url || `https://www.fourseasons.com/${entry.slug}/`,
    press_url: pressKit,
    press_hotel_facts_url: hotelFacts,
    has_hotel_facts: factsRes.ok,
    yext_id: y?.yext_id || null,
    yext_folder: y?.yext_folder || null,
    address: formatAddress(y?.address) || null,
    main_phone: y?.main_phone || null,
    has_spa,
    has_dining,
    status: existing ? 'seeded' : statusCode,
    seed_file: existing?.seed_file || `seeds/${entry.slug}-facts.json`,
    note: existing?.note || note
  };
}

async function main() {
  mkdirSync(join(root, 'data'), { recursive: true });

  console.log('Fetching press kits index…');
  const index = await fetchText(PRESS_INDEX);
  if (!index.ok) {
    throw new Error(`Press index HTTP ${index.status}`);
  }

  const entries = parsePressIndex(index.text);
  console.log(`Parsed ${entries.length} press kit links`);

  const yext = loadYextBySlug();
  console.log(`Yext enrichments: ${yext.size}`);

  const properties = [];
  for (const entry of entries) {
    process.stdout.write(`  ${entry.slug}… `);
    const row = await classify(entry, yext);
    console.log(row.status);
    properties.push(row);
    await new Promise(r => setTimeout(r, 120));
  }

  properties.sort((a, b) => a.slug.localeCompare(b.slug));

  const summary = {
    generated_at: new Date().toISOString(),
    source: PRESS_INDEX,
    totals: {
      all: properties.length,
      open: properties.filter(p => p.status === 'open').length,
      seeded: properties.filter(p => p.status === 'seeded').length,
      audited: properties.filter(p => p.status === 'audited').length,
      skip_residence: properties.filter(p => p.status === 'skip_residence').length,
      skip_unopened: properties.filter(p => p.status === 'skip_unopened').length
    },
    properties
  };

  writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n');
  console.log(`\nWrote ${outPath}`);
  console.log(JSON.stringify(summary.totals, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
