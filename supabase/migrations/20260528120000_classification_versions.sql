-- Classification layer versioning on extracted_document_data
ALTER TABLE extracted_document_data
  ADD COLUMN IF NOT EXISTS schema_version TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS prompt_version TEXT NOT NULL DEFAULT 'v1';
