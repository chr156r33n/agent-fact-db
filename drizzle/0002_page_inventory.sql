-- Additive hierarchy: existing lists remain property collections and old facts stay property-level until assigned.
CREATE TABLE pages (id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES lists(id), url TEXT NOT NULL, title TEXT NOT NULL, page_type TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(list_id,url));
--> statement-breakpoint
ALTER TABLE facts ADD COLUMN page_id TEXT REFERENCES pages(id);
--> statement-breakpoint
CREATE INDEX pages_list_type ON pages(list_id,page_type);
--> statement-breakpoint
CREATE INDEX facts_page ON facts(page_id);
--> statement-breakpoint
CREATE INDEX facts_review_status ON facts(status,updated_at);
--> statement-breakpoint
CREATE INDEX facts_list_status ON facts(list_id,status);
