-- LMNP Business Engine — Work Groups & Business Assets
--
-- Authority hierarchy:
--   extracted_document_data (Layer 1 facts)
--   → work_groups           (Layer 2 chantier consolidation proposals)
--   → business_assets       (Layer 3 confirmed economic assets)
--   → fiscal_decisions      (Layer 4 — derived, stored for audit)

-- ---------------------------------------------------------------------------
-- work_groups — chantier consolidation proposals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS work_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES lmnp_dossiers(id) ON DELETE CASCADE,
  property_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Source invoice document IDs (JSONB array of document UUIDs)
  source_document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Detected project metadata
  supplier TEXT,
  dominant_category TEXT NOT NULL
    CHECK (dominant_category IN ('travaux', 'mobilier', 'electromenager', 'immeuble', 'cuisine', 'assurance', 'taxe_fonciere', 'autre')),
  detected_project_label TEXT NOT NULL DEFAULT '',
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- Grouping intelligence
  proposed_duration_years INTEGER NOT NULL DEFAULT 10,
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 0,
  explanation TEXT NOT NULL DEFAULT '',

  -- User decision
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'confirmed', 'rejected', 'split')),
  confirmed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  -- Full payload (for client restoration without re-running the engine)
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_groups_dossier_id
  ON work_groups (dossier_id);

CREATE INDEX IF NOT EXISTS idx_work_groups_status
  ON work_groups (dossier_id, status);

ALTER TABLE work_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read work groups for their dossiers"
  ON work_groups FOR SELECT
  USING (dossier_id IN (SELECT id FROM lmnp_dossiers WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert work groups for their dossiers"
  ON work_groups FOR INSERT
  WITH CHECK (dossier_id IN (SELECT id FROM lmnp_dossiers WHERE user_id = auth.uid()));

CREATE POLICY "Users can update work groups for their dossiers"
  ON work_groups FOR UPDATE
  USING (dossier_id IN (SELECT id FROM lmnp_dossiers WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete work groups for their dossiers"
  ON work_groups FOR DELETE
  USING (dossier_id IN (SELECT id FROM lmnp_dossiers WHERE user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- business_assets — confirmed economic assets (the accounting source of truth)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS business_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID NOT NULL REFERENCES lmnp_dossiers(id) ON DELETE CASCADE,
  property_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Origin tracking
  source_work_group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Asset identity
  label TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('travaux', 'mobilier', 'electromenager', 'immeuble', 'cuisine', 'assurance', 'taxe_fonciere', 'autre')),
  amount NUMERIC(12, 2) NOT NULL,

  -- Fiscal treatment
  fiscal_treatment TEXT NOT NULL
    CHECK (fiscal_treatment IN ('immobilisation', 'charge')),
  amortization_years INTEGER NOT NULL DEFAULT 0,
  amortization_start_date DATE,
  explanation TEXT NOT NULL DEFAULT '',

  -- User validation
  user_validated BOOLEAN NOT NULL DEFAULT false,
  validated_at TIMESTAMPTZ,

  -- Derived fiscal output (stored for audit / declaration generation)
  annual_amortization NUMERIC(12, 2),
  fiscal_decision JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_assets_dossier_id
  ON business_assets (dossier_id);

CREATE INDEX IF NOT EXISTS idx_business_assets_user_validated
  ON business_assets (dossier_id, user_validated);

CREATE INDEX IF NOT EXISTS idx_business_assets_fiscal_treatment
  ON business_assets (dossier_id, fiscal_treatment);

ALTER TABLE business_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read business assets for their dossiers"
  ON business_assets FOR SELECT
  USING (dossier_id IN (SELECT id FROM lmnp_dossiers WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert business assets for their dossiers"
  ON business_assets FOR INSERT
  WITH CHECK (dossier_id IN (SELECT id FROM lmnp_dossiers WHERE user_id = auth.uid()));

CREATE POLICY "Users can update business assets for their dossiers"
  ON business_assets FOR UPDATE
  USING (dossier_id IN (SELECT id FROM lmnp_dossiers WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete business assets for their dossiers"
  ON business_assets FOR DELETE
  USING (dossier_id IN (SELECT id FROM lmnp_dossiers WHERE user_id = auth.uid()));
