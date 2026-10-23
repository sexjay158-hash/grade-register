CREATE TABLE IF NOT EXISTS group_account_assignments(account_id TEXT PRIMARY KEY,owner TEXT NOT NULL,year_id TEXT NOT NULL,group_id TEXT NOT NULL,sid TEXT NOT NULL,name TEXT NOT NULL,assigned_by TEXT NOT NULL,created TEXT NOT NULL,UNIQUE(owner,group_id));
CREATE INDEX IF NOT EXISTS group_accounts_year ON group_account_assignments(owner,year_id);
CREATE TABLE IF NOT EXISTS group_account_activations(account_id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,expires TEXT NOT NULL,used_at TEXT);
CREATE TABLE IF NOT EXISTS account_audit(id TEXT PRIMARY KEY,owner TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,account_id TEXT NOT NULL,created TEXT NOT NULL,detail TEXT NOT NULL);
