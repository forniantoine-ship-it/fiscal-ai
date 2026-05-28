-- Normalized document classification fields (governance layer)
ALTER TABLE extracted_document_data
  ADD COLUMN IF NOT EXISTS detected_category TEXT,
  ADD COLUMN IF NOT EXISTS user_category TEXT,
  ADD COLUMN IF NOT EXISTS final_category TEXT,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS classification_reason JSONB NOT NULL DEFAULT '[]'::jsonb;
