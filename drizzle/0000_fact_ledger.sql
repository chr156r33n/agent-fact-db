CREATE TABLE lists (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE facts (id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES lists(id), topic TEXT NOT NULL, claim TEXT NOT NULL, approved_claim TEXT, status TEXT NOT NULL DEFAULT 'pending', notes TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE reviews (id TEXT PRIMARY KEY, fact_id TEXT NOT NULL REFERENCES facts(id), status TEXT NOT NULL, claim TEXT NOT NULL, notes TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE api_keys (id TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, scopes TEXT NOT NULL, list_ids TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL, last_used_at TEXT);
--> statement-breakpoint
CREATE TABLE evidence (id TEXT PRIMARY KEY, fact_id TEXT NOT NULL REFERENCES facts(id), url TEXT NOT NULL, quote TEXT NOT NULL, party TEXT NOT NULL, verdict TEXT NOT NULL, notes TEXT NOT NULL, actor TEXT NOT NULL, observed_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX facts_list ON facts(list_id);
--> statement-breakpoint
CREATE INDEX evidence_fact ON evidence(fact_id);
