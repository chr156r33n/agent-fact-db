# Agent Fact DB

A Cloudflare Worker + D1 fact library with human review and scoped MCP access. No ChatGPT hosting dependency. The browser interface uses administrator Basic authentication over HTTPS; agents use their own scoped bearer keys.

## Deploy using Cloudflare Workers Builds

1. Create a D1 database named `agent-fact-db` in Cloudflare. Copy its database UUID.
2. Create a Worker by importing this GitHub repository in **Workers & Pages**. Worker name: `agent-fact-db`.
3. Configure the build with Node **24**, build command `npm run build`, deploy command `npm run deploy`, root directory `/`.
4. Add a **build variable** named `D1_DATABASE_ID` with the database UUID. The deploy command writes the real binding to the Wrangler configuration and applies migrations before publishing.
5. Set Worker **runtime secrets** `ADMIN_PASSWORD` (a random password of at least 20 characters) and optionally `ADMIN_USERNAME` (defaults to `admin`). Never put them in source or GitHub. If these are missing, the UI fails closed with HTTP 503. If adding them after the initial deployment, visit the app only after setting them.
6. Open the resulting `workers.dev` URL. Sign in using the administrator credentials. Create a fact list and add facts. No database records are seeded.

The all-zero-shaped UUID in `wrangler.jsonc` is an intentionally unusable placeholder. Deploy refuses to proceed until `D1_DATABASE_ID` is supplied or the placeholder is replaced with a real database ID. The database ID is configuration, not a secret.

An alternative is the manual **Deploy Cloudflare Worker** GitHub Actions workflow: add repository secrets `CLOUDFLARE_API_TOKEN` (Worker edit + D1 edit for your account), `CLOUDFLARE_ACCOUNT_ID`, and repository variable `D1_DATABASE_ID`, then run the workflow. Configure the administrator runtime secrets in Cloudflare. Pushes run validation but do not trigger deployments automatically.

## Local setup / CLI deploy

Requires Node 24+ and npm.

```sh
npm ci
cp .dev.vars.example .dev.vars
# Replace ADMIN_PASSWORD in .dev.vars with a random local password.
npm run dev
```

Wrangler dev uses a local D1 database. `.dev.vars` and local database files are ignored by Git. For remote CLI deployment:

```sh
npx wrangler login
npx wrangler d1 create agent-fact-db
# Put its returned UUID into wrangler.jsonc, replacing the placeholder.
npm run deploy
npx wrangler secret put ADMIN_PASSWORD
# Optional:
npx wrangler secret put ADMIN_USERNAME
```

Secret values are entered at Wrangler's prompt, never as shell arguments. This deployment creates a new, empty database; it does not migrate records from the ChatGPT-hosted prototype.

## Property/page inventory and bulk review

The administrator UI now includes **Inventory & bulk review** at `/inventory`. This is an operational view across all property collections, rather than a requirement to open each page. Existing `lists` are treated as property collections to preserve current MCP keys and data. Pages can be added with a title, controlled page type and canonical URL. Facts without `page_id` remain property-level; existing facts are **not** automatically assigned.

- Filter by property, page type, page, review status or matching text. Results are retrieved from D1 in batches of 50, with server-side counts and pagination.
- Select facts across multiple result pages and **confirm**, **deny** or **amend** them. Amendments require individual replacement text; denying requires a reason. Each decision creates an individual review-history entry.
- Use **Review all matching** after selecting an explicit status filter to process the entire filtered set in bounded batches. Preview the filter and number of matching facts carefully before submitting. At this prototype stage bulk writes run from the active browser tab and must stay open until completion.
- Assign existing selected facts to an inventory page, without changing approval state. The assignment must stay within the same property.
- Only the authenticated administrator can use these endpoints. MCP credentials retain their existing scoped access. The original fact review and source finding screens remain available at `/`.

Migration `0002_page_inventory.sql` is additive. The existing `npm run deploy` command applies it to D1 before deploying the Worker. **Do not use `npx wrangler deploy` as the Cloudflare Builds deployment command**, as it skips migrations. Back up your remote D1 database before deployment.

**Current limits:** one page association per fact (property-level facts may remain unassigned); single administrator; up to 5,000 page entries in the metadata dropdown; page result fetches capped at 100; bulk-selected server requests capped at 50 facts per transaction. Later enhancements can add multi-page fact relationships, independent client-level permissions, asynchronous bulk jobs, large-inventory page lookup, and richer audit/export views.

## Fact review

Create lists by property, brand or business. Add one claim per fact with an optional source URL.

- **Accept:** approves the original claim.
- **Contest:** requires a reason and excludes the fact from the approved reference.
- **Correct:** saves replacement text and optional notes; the original claim remains visible.

Every review appends a history entry. A stale concurrent review fails with HTTP 409 rather than overwriting a newer decision. Agent findings and advisory assessments never approve or modify the authoritative status of facts. One administrator role is supported in this prototype; multi-user roles are not implemented.

## MCP connection

Use Streamable HTTP at `https://YOUR-WORKER-HOST/mcp` (or `/agent/mcp`) with one header:

```text
Authorization: Bearer <fact-key>
```

Create keys under **Agent access**. Choose `facts:read` and/or `evidence:write`, restrict to selected fact lists, set an expiry, and regenerate or revoke as needed. Unrestricted keys include future lists. Keys are shown once and stored only as SHA-256 hashes. Regeneration revokes the previous key atomically. Administrator credentials do not grant MCP access; agents never receive the administrator password. Caller-supplied identity headers are stripped and cannot bypass authentication.

Tools:

- `list_fact_lists`: list collections within the key's scope.
- `get_facts`: takes `list_id`; accepted/corrected facts by default. Optional `include_unapproved` returns all states, explicitly labelled.
- `record_source_finding`: takes `fact_id`, `url`, `quote`, `party` (`first`, `second`, `third`), `verdict` (`matches`, `contradicts`, `unclear`), optional `notes`.
- `list_source_findings`: lists existing findings within a scoped fact list, with finding IDs.
- `propose_fact`: submits `list_id`, `topic`, `claim`, optional `source_url`, `notes` as a **pending** fact.
- `assess_fact`: records an agent `confirm` or `contest` assessment against `fact_id` with mandatory `notes`. This does **not** alter the authoritative approval state.
- `promote_source_finding`: takes an existing `finding_id`, `topic`, `claim`, optional `notes` or target `list_id`; creates one pending fact preserving the original finding URL and a provenance link. Repeating a promotion returns the existing fact.

**Permissions:** use `facts:read` for lists/facts; `evidence:read` to list findings; `evidence:write` to record findings; `facts:propose` to propose or promote; `facts:assess` to confirm/challenge a fact. Assign minimum scopes and explicit list IDs to each key. Existing keys retain their old scopes; regenerate to add capabilities.

**Human approval remains mandatory.** Agents cannot accept/correct/contest the library's authoritative state. The administrator reviews pending facts in the Fact Ledger UI. Agents' confirmations/contests are stored separately as advisory assessments. Pending/contested facts remain excluded from default `get_facts` results. The Source findings screen now has a **Promote to fact** action. A source finding still references a fact in the current schema, so truly standalone discoveries should first be submitted through `propose_fact`; the promotion action is for creating a distinct claim based on a finding about an existing fact.

Example initialize request:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"fact-auditor","version":"1.0"}}}
```

The MCP client must support configurable bearer headers. No OAuth flow, long-lived SSE stream, browser cross-origin API or session persistence is implemented. Both supported MCP endpoints are stateless JSON-RPC over HTTP.

## Source verification workflow

The agent reads approved facts, searches using its own DataForSEO connection, inspects the actual source page, and records a quotation and comparison. First-party = owned; second-party = partner or managed listing; third-party = independent. Establish the actual relationship; hostname alone is insufficient.

The app does not run searches or independently fetch/verify submitted quotations. Treat classifications and comparisons as agent-submitted evidence for human review. Reference URLs are not fetched server-side.

## Checks and limits

```sh
npm test
npm run build
```

Tests cover reviews, correction history, concurrency, CSRF, key permissions, list isolation, expiry, regeneration, revocation, header spoofing and secret redaction, plus fact proposals, agent assessments and source-finding promotion. Build performs a Wrangler dry run. CI uses Node 24.

UI limits: 2,000 facts and 1,000 recent reviews/findings. MCP: 500 facts per list. Pagination, automatic search scheduling, review-date reminders and evidence resolution are not yet implemented. Use Cloudflare rate limiting/Access policies as needed for your environment; do not place an interactive Access gate in front of MCP unless the agent is also configured for that gate.
