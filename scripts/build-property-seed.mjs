#!/usr/bin/env node
/**
 * Build SF-shaped seed JSON for one or more FS properties from press hotel-facts
 * (and registry NAP when present).
 *
 * Usage:
 *   node scripts/build-property-seed.mjs chicago
 *   node scripts/build-property-seed.mjs --slugs chicago,toronto,sydney,paris,miami
 *   node scripts/build-property-seed.mjs --pilot
 *   node scripts/build-property-seed.mjs --all-open
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const registryPath = join(root, 'data', 'fs-properties.json');
const seedsDir = join(root, 'seeds');

const UA =
  'Mozilla/5.0 (compatible; AgentFactDB/1.0; +https://github.com/agent-fact-db)';

const PILOT_SLUGS = ['chicago', 'toronto', 'sydney', 'paris', 'miami'];

const PAGE_DEFS = [
  { key: 'homepage', title: 'Hotel Overview', path: '/', page_type: 'General' },
  {
    key: 'accommodation',
    title: 'Accommodation',
    path: '/accommodations/',
    page_type: 'Accommodation'
  },
  {
    key: 'amenities',
    title: 'Services & Amenities',
    path: '/services-and-amenities/',
    page_type: 'Facilities'
  },
  { key: 'dining', title: 'Dining', path: '/dining/', page_type: 'Dining' },
  { key: 'spa', title: 'Spa', path: '/spa/', page_type: 'Spa' },
  {
    key: 'contact',
    title: 'Contact Us',
    path: '/contact-us/',
    page_type: 'General'
  },
  {
    key: 'location',
    title: 'Location / Getting Here',
    path: '/getting-here/',
    page_type: 'General'
  },
  {
    key: 'hotel-facts',
    title: 'Hotel Fact Sheet',
    path: null,
    page_type: 'General'
  }
];

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'follow'
  });
  return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : '', url: res.url };
}

function htmlToLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(h[1-6]|li|p|div|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

function cleanValue(value) {
  if (!value) return null;
  let v = value
    .replace(/Show more\.\.\./gi, '')
    .replace(/Show less/gi, '')
    .replace(/Expand all/gi, '')
    .replace(/Collapse all/gi, '')
    .replace(/-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Truncate at next labelled field if regex over-captured
  v = v.split(
    /(?=\b(?:OPENING DATE|GENERAL MANAGER|Physical Features|Total Number|Guest Rooms|Suites|Number of Stories|Design Aesthetic|Architect|Interior Designer|Location|Spa|Dining|Restaurant|Pools|Fitness|Meeting|PRINT|DOWNLOAD)\b)/i
  )[0]
    .trim();
  if (!v || v.length < 2) return null;
  return v.slice(0, 280);
}

function matchField(lines, label) {
  const labelRe = new RegExp(`^${label}\\s*:?$`, 'i');
  const inlineRe = new RegExp(`^${label}\\s*:\\s*(.+)$`, 'i');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inline = line.match(inlineRe);
    if (inline) return cleanValue(inline[1]);
    if (labelRe.test(line) && lines[i + 1]) {
      return cleanValue(lines[i + 1]);
    }
  }
  return null;
}

function matchBlock(lines, label, stopLabels) {
  const labelRe = new RegExp(`^${label}\\s*:?$`, 'i');
  const stopRe = new RegExp(
    `^(${stopLabels.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:?$`,
    'i'
  );
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (labelRe.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;
  const parts = [];
  for (let i = start; i < lines.length; i++) {
    if (stopRe.test(lines[i])) break;
    if (/^Show more/i.test(lines[i]) || /^Show less/i.test(lines[i])) continue;
    parts.push(lines[i]);
    if (parts.join(' ').length > 360) break;
  }
  return cleanValue(parts.join(' '));
}

function extractRestaurants(lines) {
  const names = new Set();
  for (const line of lines) {
    const m = line.match(/^Restaurant:\s*(.+)$/i);
    if (!m) continue;
    const name = cleanValue(m[1]);
    if (name && name.length > 2 && !/cuisine|dining room/i.test(name)) {
      names.add(name);
    }
  }
  return [...names];
}

function sitePath(siteUrl, path) {
  const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  return new URL(path.replace(/^\//, ''), base).href;
}

function fact(page_key, topic, claim, source_url) {
  return { page_key, topic, claim, source_url };
}

function buildPages(slug, siteUrl, pressFactsUrl, includeSpa) {
  const pages = [];
  for (const def of PAGE_DEFS) {
    if (def.key === 'spa' && includeSpa === false) continue;
    const url =
      def.key === 'hotel-facts'
        ? pressFactsUrl
        : sitePath(siteUrl, def.path === '/' ? '' : def.path);
    pages.push({
      key: def.key,
      title: def.title,
      url: url.endsWith('/') || def.key === 'hotel-facts' ? url : `${url}/`,
      page_type: def.page_type
    });
  }
  // Normalise homepage
  const home = pages.find(p => p.key === 'homepage');
  if (home) home.url = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  return pages;
}

function buildFacts(prop, lines, pressFactsUrl, siteUrl) {
  const facts = [];
  const name = prop.name;
  const address = prop.address;

  facts.push(
    fact(
      'homepage',
      'Property name',
      `The property's name is ${name}.`,
      siteUrl
    )
  );

  if (address) {
    facts.push(
      fact(
        'homepage',
        'Address',
        `The hotel is located at ${address.replace(/\s+/g, ' ').trim()}.`,
        siteUrl
      )
    );
  }

  if (prop.main_phone) {
    facts.push(
      fact(
        'homepage',
        'Telephone',
        `The hotel's main telephone number is ${prop.main_phone}.`,
        siteUrl
      )
    );
  }

  const opening =
    matchField(lines, 'OPENING DATE') || matchField(lines, 'Opening Date');
  if (opening) {
    facts.push(
      fact(
        'hotel-facts',
        'Opening date',
        `The property opened in ${opening}.`,
        pressFactsUrl
      )
    );
  }

  const gm =
    matchField(lines, 'GENERAL MANAGER') ||
    matchField(lines, 'General Manager');
  if (gm) {
    facts.push(
      fact(
        'hotel-facts',
        'General Manager',
        `The General Manager is ${gm}.`,
        pressFactsUrl
      )
    );
  }

  const rooms =
    matchField(lines, 'Total Number of Guest Rooms') ||
    matchField(lines, 'Total Rooms');
  if (rooms) {
    const n = rooms.match(/[\d,]+/)?.[0];
    if (n) {
      facts.push(
        fact(
          'hotel-facts',
          'Total rooms',
          `The property has ${n.replace(/,/g, '')} guest rooms.`,
          pressFactsUrl
        )
      );
    }
  }

  const guestRooms = matchField(lines, 'Guest Rooms');
  if (guestRooms && /^[\d,]+$/.test(guestRooms.replace(/\s/g, ''))) {
    facts.push(
      fact(
        'hotel-facts',
        'Guest rooms count',
        `There are ${guestRooms} guest rooms (excluding suites counted separately when listed).`,
        pressFactsUrl
      )
    );
  }

  const suites = matchField(lines, 'Suites');
  if (suites && /^[\d,]+$/.test(suites.replace(/\s/g, ''))) {
    facts.push(
      fact(
        'hotel-facts',
        'Suites count',
        `There are ${suites} suites.`,
        pressFactsUrl
      )
    );
  }

  const stories = matchField(lines, 'Number of Stories');
  if (stories) {
    facts.push(
      fact(
        'hotel-facts',
        'Building configuration',
        `Building configuration: ${stories}.`,
        pressFactsUrl
      )
    );
  }

  const location = matchBlock(lines, 'Location', [
    'Spa',
    'Dining',
    'Pools',
    'Fitness Facilities',
    'Renovated'
  ]);
  if (location && location.length > 20) {
    facts.push(
      fact(
        'hotel-facts',
        'Location',
        `Location: ${location}`,
        pressFactsUrl
      )
    );
  }

  const architects = [];
  const archIdx = lines.findIndex(l => /^Architect:?$/i.test(l));
  if (archIdx >= 0) {
    for (let i = archIdx + 1; i < lines.length; i++) {
      if (/^(Interior Designer|Location|Spa|Dining|Design Aesthetic)/i.test(lines[i])) break;
      if (lines[i].length > 2 && lines[i].length < 100) architects.push(lines[i]);
    }
  }
  if (architects.length) {
    facts.push(
      fact(
        'hotel-facts',
        'Architect',
        `The architect is ${architects.join('; ')}.`,
        pressFactsUrl
      )
    );
  }

  const spaSizeIdx = lines.findIndex(
    (l, i) => /^Size:\s*.*sq/i.test(l) && lines.slice(Math.max(0, i - 8), i).some(x => /^Spa$/i.test(x))
  );
  if (spaSizeIdx >= 0) {
    const size = cleanValue(lines[spaSizeIdx].replace(/^Size:\s*/i, ''));
    if (size) {
      facts.push(
        fact('spa', 'Spa size', `The spa is ${size}.`, pressFactsUrl)
      );
    }
  }

  const treatments = matchField(lines, 'Number of Treatment Rooms');
  if (treatments) {
    const n = treatments.match(/[\d,]+/)?.[0];
    if (n) {
      facts.push(
        fact(
          'spa',
          'Spa treatment rooms',
          `The spa has ${n} treatment rooms.`,
          pressFactsUrl
        )
      );
    }
  }

  const meeting = matchField(lines, 'Total Size');
  if (meeting && /sq/i.test(meeting)) {
    facts.push(
      fact(
        'hotel-facts',
        'Meeting space',
        `Total meeting space is ${meeting}.`,
        pressFactsUrl
      )
    );
  }

  const ballroom = matchField(lines, 'Largest Ballroom');
  if (ballroom) {
    const cleaned = cleanValue(ballroom);
    if (cleaned) {
      facts.push(
        fact(
          'hotel-facts',
          'Largest ballroom',
          `The largest ballroom is ${cleaned}.`,
          pressFactsUrl
        )
      );
    }
  }

  const fitness = matchField(lines, 'Size');
  // Fitness size is often the second Size near Fitness Facilities — handled lightly
  const fitnessIdx = lines.findIndex(l => /^Fitness Facilities/i.test(l));
  if (fitnessIdx >= 0) {
    for (let i = fitnessIdx; i < Math.min(fitnessIdx + 6, lines.length); i++) {
      const m = lines[i].match(/^Size:\s*(.+)$/i);
      if (m && /sq/i.test(m[1])) {
        facts.push(
          fact(
            'amenities',
            'Fitness facilities size',
            `Fitness facilities are ${cleanValue(m[1])}.`,
            sitePath(siteUrl, 'services-and-amenities/')
          )
        );
        break;
      }
    }
  }

  for (const venue of extractRestaurants(lines).slice(0, 10)) {
    facts.push(
      fact(
        'dining',
        `Dining - ${venue}`,
        `The property offers dining at ${venue}.`,
        sitePath(siteUrl, 'dining/')
      )
    );
  }

  const pools = matchField(lines, 'Number of Pools');
  if (pools) {
    const n = pools.match(/[\d,]+/)?.[0];
    if (n) {
      facts.push(
        fact(
          'amenities',
          'Swimming pools',
          `The property has ${n} swimming pool${n === '1' ? '' : 's'}.`,
          sitePath(siteUrl, 'services-and-amenities/')
        )
      );
    }
  }

  // Deduplicate by topic+claim
  const seen = new Set();
  return facts.filter(f => {
    const key = `${f.topic}||${f.claim}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.includes('--pilot')) return PILOT_SLUGS;
  if (args.includes('--all-open')) return null; // sentinel
  const idx = args.indexOf('--slugs');
  if (idx >= 0) {
    return args[idx + 1].split(',').map(s => s.trim().toLowerCase());
  }
  if (args[0] && !args[0].startsWith('-')) {
    return args.map(s => s.toLowerCase());
  }
  throw new Error(
    'Usage: build-property-seed.mjs <slug>|--slugs a,b|--pilot|--all-open'
  );
}

function extractH1Name(html) {
  const m = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function extractAddressFromHtml(html) {
  // Press kits often list the street address in the first content list item.
  const m = html.match(
    /<li[^>]*>\s*(\d[^<]{8,160}|(?:P\.?O\.? Box|Pinney|Jimbaran|Barnes|Avenue|Street|Road|Blvd)[^<]{8,160})<\/li>/i
  );
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

async function buildOne(prop) {
  const siteUrl = prop.site_url.endsWith('/')
    ? prop.site_url
    : `${prop.site_url}/`;
  const pressFactsUrl =
    prop.press_hotel_facts_url ||
    `https://press.fourseasons.com/${prop.slug}/hotel-facts/`;

  let sourceUrl = pressFactsUrl;
  let { ok, status, text } = await fetchText(pressFactsUrl);
  if (!ok) {
    const kit = await fetchText(prop.press_url || `https://press.fourseasons.com/${prop.slug}/`);
    if (!kit.ok) {
      throw new Error(`${prop.slug}: hotel-facts HTTP ${status}; press kit HTTP ${kit.status}`);
    }
    text = kit.text;
    sourceUrl = prop.press_url;
    console.warn(`${prop.slug}: no hotel-facts; using press kit`);
  }

  const h1 = extractH1Name(text);
  if (h1) prop = { ...prop, name: h1 };
  const pageAddress = extractAddressFromHtml(text);
  if (pageAddress && !prop.address) {
    prop = { ...prop, address: pageAddress };
  }

  const lines = htmlToLines(text);
  const includeSpa = lines.some(l =>
    /treatment rooms?|^\s*spa\s*$|spa:/i.test(l)
  );
  const pages = buildPages(prop.slug, siteUrl, pressFactsUrl, includeSpa);
  const facts = buildFacts(prop, lines, sourceUrl, siteUrl);

  const seed = {
    property: prop.name,
    pages,
    facts
  };

  const outFile = join(seedsDir, `${prop.slug}-facts.json`);
  if (existsSync(outFile)) {
    const prev = readFileSync(outFile, 'utf8');
    const next = JSON.stringify(seed, null, 2) + '\n';
    if (prev === next) {
      console.log(`Unchanged: ${outFile} (${facts.length} facts)`);
      return { outFile, facts: facts.length, unchanged: true };
    }
  }

  writeFileSync(outFile, JSON.stringify(seed, null, 2) + '\n');
  console.log(`Wrote ${outFile} (${facts.length} facts, ${pages.length} pages)`);
  return { outFile, facts: facts.length, unchanged: false };
}

async function main() {
  mkdirSync(seedsDir, { recursive: true });
  if (!existsSync(registryPath)) {
    throw new Error('Missing data/fs-properties.json — run discover-fs-properties.mjs first');
  }

  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  let slugs = parseArgs();
  if (slugs === null) {
    slugs = registry.properties
      .filter(p => p.status === 'open' || p.status === 'seeded')
      .map(p => p.slug);
  }

  const bySlug = new Map(registry.properties.map(p => [p.slug, p]));
  let built = 0;
  for (const slug of slugs) {
    const prop = bySlug.get(slug);
    if (!prop) {
      console.warn(`Skip unknown slug: ${slug}`);
      continue;
    }
    if (prop.status === 'skip_residence' || prop.status === 'skip_unopened') {
      console.warn(`Skip ${slug} (${prop.status})`);
      continue;
    }
    if (prop.note === 'enrich-only' && !process.argv.includes('--force-enrich')) {
      console.warn(`Skip enrich-only ${slug} (use --force-enrich to overwrite auto-seed)`);
      continue;
    }
    await buildOne(prop);
    built++;
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`\nBuilt ${built} seed(s)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
