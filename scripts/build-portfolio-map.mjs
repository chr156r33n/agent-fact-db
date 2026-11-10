#!/usr/bin/env node
/** Build data/portfolio-map.json from registry + seeds (pages + topic notes). */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';

const registry = JSON.parse(readFileSync('data/fs-properties.json', 'utf8'));

function regionFor(slug, siteUrl) {
  // Keep existing map regions when present; otherwise coarse bucket by TLD path heuristics
  const known = {
    MEA: ['abudhabi','alexandria','amaalaredsea','amman','bahrain','beirut','cairofr','caironp','casablanca','doha','dubaidifc','dubaijb','johannesburg','kuwait','marrakech','mauritius','rabat','redseashuraisland','riyadh','serengeti','seychelles','seychellesdesroches','sharmelsheikh','thepearlqatar','tunis'],
    Europe: ['athens','baku','bosphorus','budapest','capferrat','florence','geneva','gstaad','hampshire','istanbul','lisbon','london','madrid','mallorca','megeve','milan','mykonos','paris','prague','taormina','towerbridge','venice'],
    Americas: ['anguilla','atlanta','austin','baltimore','beverlywilshire','boston','chicago','denver','embarcadero','fortlauderdale','houston','hualalai','jacksonhole','jacksonville','lanai','lasvegas','losangeles','maui','miami','minneapolis','montreal','napavalley','naplesbeachclub','nashville','nevis','neworleans','newyork','newyorkdowntown','oahu','oceanclub','onedalton','orlando','palmbeach','philadelphia','puertorico','sanfrancisco','santafe','scottsdale','seattle','sensei','siliconvalley','stlouis','surfside','toronto','vail','washington','westlakevillage','whistler'],
    LATAM: ['bogota','buenosaires','cabodelsol','cartagena','casamedina','costarica','dominicanrepublic','loscabos','mexico','naviva','puntamita','tamarindo'],
    APAC: ['bangkok','beijing','bengaluru','borabora','chiangmai','dalian','explorerpalau','goldentriangle','guangzhou','hangzhou','hangzhoucentre','hoian','hongkong','jakarta','jimbaranbay','kohsamui','kualalumpur','kyoto','langkawi','macau','maldiveskh','maldiveslg','maldivesvoavah','mumbai','osaka','otemachi','sayan','seoul','shenzhen','singapore','suzhou','sydney','tianjin','tokyo'],
  };
  for (const [region, slugs] of Object.entries(known)) {
    if (slugs.includes(slug)) return region;
  }
  return 'Other';
}

const properties = [];
for (const p of registry.properties) {
  if (!['seeded', 'audited', 'open'].includes(p.status) && p.status?.startsWith('skip')) continue;
  if (!['seeded', 'audited'].includes(p.status) && p.status !== 'open') continue;

  let pages = [];
  let topics = [];
  let note = p.note || null;
  if (p.seed_file && existsSync(p.seed_file)) {
    try {
      const seed = JSON.parse(readFileSync(p.seed_file, 'utf8'));
      pages = (seed.pages || []).map((pg) => ({
        key: pg.key,
        title: pg.title,
        url: pg.url,
        page_type: pg.page_type,
        facts: (seed.facts || []).filter((f) => f.page_key === pg.key).length,
        topics: [...new Set((seed.facts || []).filter((f) => f.page_key === pg.key).map((f) => f.topic))].slice(0, 8),
      }));
      topics = [...new Set((seed.facts || []).map((f) => f.topic))].slice(0, 12);
      if (!note && seed.notes) note = seed.notes;
    } catch {
      /* ignore bad seed */
    }
  }

  const label = (p.press_label || p.name || p.slug).replace(/^Four Seasons\s+(Hotel\s+and\s+Residences|Resort\s+and\s+Residences|Hotel|Resort)\s+/i, '').replace(/^Four Seasons\s+[—–-]\s*/i, '').trim();

  properties.push({
    slug: p.slug,
    label,
    region: regionFor(p.slug, p.site_url),
    status: p.status,
    facts: pages.reduce((n, pg) => n + pg.facts, 0) || (p.facts ?? 0),
    site_url: p.site_url,
    press_url: p.press_url,
    note,
    pages,
    topics,
  });
}

// Preserve fact counts from previous map when seeds missing page facts
let prev = null;
try {
  prev = JSON.parse(readFileSync('data/portfolio-map.json', 'utf8'));
} catch {
  /* first build */
}
if (prev?.properties) {
  const bySlug = Object.fromEntries(prev.properties.map((x) => [x.slug, x]));
  for (const p of properties) {
    if (!p.facts && bySlug[p.slug]?.facts) p.facts = bySlug[p.slug].facts;
    if (!p.region && bySlug[p.slug]?.region) p.region = bySlug[p.slug].region;
  }
}

const totals = {
  all: properties.length,
  open: properties.filter((p) => p.status === 'open').length,
  seeded: properties.filter((p) => p.status === 'seeded').length,
  audited: properties.filter((p) => p.status === 'audited').length,
  pages: properties.reduce((n, p) => n + p.pages.length, 0),
  skip_residence: registry.totals?.skip_residence || 0,
  skip_unopened: registry.totals?.skip_unopened || 0,
};

const out = {
  generated_at: new Date().toISOString(),
  totals,
  properties,
};
writeFileSync('data/portfolio-map.json', JSON.stringify(out) + '\n');
console.log(`Wrote data/portfolio-map.json — ${totals.all} properties, ${totals.pages} pages`);
