
import { readFileSync } from 'node:fs';

const base = process.env.FACT_DB_URL?.replace(/\/$/, '');
const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD;
const file = process.argv[2];

if (!base || !password || !file) {
  throw new Error(
    'Set FACT_DB_URL, ADMIN_PASSWORD and supply a JSON file.'
  );
}

const origin = new URL(base).origin;
const auth = 'Basic ' +
  Buffer.from(`${username}:${password}`).toString('base64');

async function api(path, data) {
  const response = await fetch(`${base}/api/${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: auth,
      Origin: origin,
      'Content-Type': 'application/json'
    },
    ...(data === undefined
      ? {}
      : { body: JSON.stringify(data) })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      `${path}: HTTP ${response.status}: ` +
      (result.error || JSON.stringify(result))
    );
  }

  return result;
}

const seed = JSON.parse(readFileSync(file, 'utf8'));

// 1. Find or create property
const state = await api('state');

let property = state.lists.find(
  l => l.name === seed.property
);

if (!property) {
  property = await api('lists', {
    name: seed.property
  });

  console.log(`Created property: ${seed.property}`);
}

const listId = property.id;

// 2. Retrieve all existing facts, using server pagination
async function getExistingFacts() {
  const facts = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      list_id: listId,
      limit: '100',
      offset: String(offset)
    });

    const result = await api(`inventory/facts?${params}`);

    facts.push(...result.facts);
    offset += result.facts.length;

    if (offset >= result.total || !result.facts.length) {
      break;
    }
  }

  return facts;
}

const existing = await getExistingFacts();
const knownFacts = new Map(
  existing.map(f => [
    JSON.stringify([f.topic, f.claim]),
    f
  ])
);

// 3. Create or retrieve inventory pages
const pageIds = new Map();

for (const page of seed.pages) {
  const result = await api('inventory/pages', {
    list_id: listId,
    title: page.title,
    url: page.url,
    page_type: page.page_type
  });

  pageIds.set(page.key, result.id);

  console.log(
    `${result.created ? 'Created' : 'Found'} page: ${page.title}`
  );
}

// 4. Import and associate facts
let added = 0;
let skipped = 0;
let assigned = 0;

for (const fact of seed.facts) {
  const {
    page_key,
    topic,
    claim,
    source_url
  } = fact;

  const key = JSON.stringify([topic, claim]);
  let record = knownFacts.get(key);

  if (!record) {
    record = await api('facts', {
      list_id: listId,
      topic,
      claim,
      source_url
    });

    knownFacts.set(key, record);
    added++;
  } else {
    skipped++;
  }

  // Facts without a page_key remain property-level.
  if (page_key) {
    const pageId = pageIds.get(page_key);

    if (!pageId) {
      throw new Error(`Unknown page_key: ${page_key}`);
    }

    if (!record.page_id) {
      await api('inventory/assign', {
        page_id: pageId,
        fact_ids: [record.id]
      });

      record.page_id = pageId;
      assigned++;
    } else if (record.page_id !== pageId) {
      console.warn(
        `Skipped reassignment: ${topic} already belongs to another page`
      );
    }
  }
}

console.log('\nImport complete');
console.log(`Property: ${seed.property}`);
console.log(`Pages processed: ${seed.pages.length}`);
console.log(`Facts added: ${added}`);
console.log(`Existing facts skipped: ${skipped}`);
console.log(`Page assignments created: ${assigned}`);
console.log('New facts remain pending human review.');
