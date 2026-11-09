-- Soft-dismiss source findings that are not useful; they remain for audit.
ALTER TABLE evidence ADD COLUMN dismissed_at TEXT;
--> statement-breakpoint
ALTER TABLE evidence ADD COLUMN dismissed_by TEXT;
--> statement-breakpoint
ALTER TABLE evidence ADD COLUMN dismiss_notes TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
-- Duplicate facts point at a preferred canonical claim in the same list.
ALTER TABLE facts ADD COLUMN duplicate_of TEXT REFERENCES facts(id);
--> statement-breakpoint
CREATE INDEX evidence_dismissed ON evidence(dismissed_at);
--> statement-breakpoint
CREATE INDEX facts_duplicate_of ON facts(duplicate_of);
