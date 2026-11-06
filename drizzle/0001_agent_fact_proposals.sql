-- Agent assessments are advisory only and never change authoritative review states.
CREATE TABLE agent_assessments (id TEXT PRIMARY KEY, fact_id TEXT NOT NULL REFERENCES facts(id), assessment TEXT NOT NULL CHECK(assessment IN ('confirm','contest')), notes TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX assessments_fact ON agent_assessments(fact_id);
--> statement-breakpoint
-- Each source finding may create at most one pending fact.
CREATE TABLE fact_origins (fact_id TEXT PRIMARY KEY REFERENCES facts(id), finding_id TEXT NOT NULL UNIQUE REFERENCES evidence(id), created_at TEXT NOT NULL, actor TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX origins_finding ON fact_origins(finding_id);
