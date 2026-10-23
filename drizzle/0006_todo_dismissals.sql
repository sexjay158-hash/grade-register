CREATE TABLE IF NOT EXISTS todo_dismissals (
 owner TEXT NOT NULL,
 account_id TEXT NOT NULL,
 year_id TEXT NOT NULL,
 todo_id TEXT NOT NULL,
 revision TEXT NOT NULL,
 created TEXT NOT NULL,
 PRIMARY KEY(owner,account_id,year_id,todo_id)
);
