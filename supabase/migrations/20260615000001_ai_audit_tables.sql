-- AI Risk Analyses table
CREATE TABLE IF NOT EXISTS public.ai_risk_analyses (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id             UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  executive_summary         TEXT NOT NULL,
  overall_assessment        TEXT,
  critical_gaps             JSONB DEFAULT '[]'::jsonb,
  category_findings         JSONB DEFAULT '[]'::jsonb,
  remediation_roadmap       JSONB DEFAULT '[]'::jsonb,
  risk_acceptance_rationale TEXT,
  model_used                TEXT DEFAULT 'claude-sonnet-4-6',
  generated_at              TIMESTAMPTZ DEFAULT NOW(),
  generated_by              UUID REFERENCES auth.users(id)
);

ALTER TABLE public.ai_risk_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ai analyses"
  ON public.ai_risk_analyses FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert ai analyses"
  ON public.ai_risk_analyses FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update ai analyses"
  ON public.ai_risk_analyses FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Audit Logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type    TEXT NOT NULL,
  entity_id      UUID NOT NULL,
  action         TEXT NOT NULL,
  performed_by   UUID REFERENCES auth.users(id),
  performer_name TEXT,
  details        JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ai_analyses_assessment ON public.ai_risk_analyses(assessment_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
