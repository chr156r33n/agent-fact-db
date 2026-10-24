import {readFileSync,writeFileSync} from 'node:fs';
const p='wrangler.jsonc';const c=JSON.parse(readFileSync(p,'utf8'));const input=process.env.D1_DATABASE_ID;
if(input){if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input))throw Error('D1_DATABASE_ID must be the database UUID from Cloudflare.');c.d1_databases[0].database_id=input;writeFileSync(p,JSON.stringify(c,null,2)+'\n')}
if(process.argv.includes('--required')&&c.d1_databases[0].database_id==='00000000-0000-4000-8000-000000000000')throw Error('Set D1_DATABASE_ID in Cloudflare Builds / GitHub Actions, or replace the placeholder database_id in wrangler.jsonc.');
