CREATE TABLE IF NOT EXISTS intake_upload_scopes (
 owner TEXT NOT NULL,
 intake_id TEXT NOT NULL,
 college_id TEXT NOT NULL,
 PRIMARY KEY(owner,intake_id)
);
