-- Universal document extraction results (LMNP document understanding layer)
CREATE TABLE IF NOT EXISTS extracted_document_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  dossier_id UUID NOT NULL REFERENCES lmnp_dossiers(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL DEFAULT '',
  structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  document_type TEXT NOT NULL DEFAULT 'unknown',
  confidence_score NUMERIC(4, 3) NOT NULL DEFAULT 0,
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
  ai_model TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extracted_document_data_dossier_id
  ON extracted_document_data (dossier_id);

CREATE INDEX IF NOT EXISTS idx_extracted_document_data_document_id
  ON extracted_document_data (document_id);

CREATE INDEX IF NOT EXISTS idx_extracted_document_data_status
  ON extracted_document_data (extraction_status);

ALTER TABLE extracted_document_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read extractions for their dossiers"
  ON extracted_document_data
  FOR SELECT
  USING (
    dossier_id IN (
      SELECT id FROM lmnp_dossiers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert extractions for their dossiers"
  ON extracted_document_data
  FOR INSERT
  WITH CHECK (
    dossier_id IN (
      SELECT id FROM lmnp_dossiers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update extractions for their dossiers"
  ON extracted_document_data
  FOR UPDATE
  USING (
    dossier_id IN (
      SELECT id FROM lmnp_dossiers WHERE user_id = auth.uid()
    )
  );
