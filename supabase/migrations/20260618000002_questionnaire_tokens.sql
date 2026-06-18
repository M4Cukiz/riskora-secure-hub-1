-- Token table (same pattern as Risk Compass questionnaire_responses)
CREATE TABLE public.questionnaire_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  supplier_email TEXT NOT NULL,
  supplier_type TEXT NOT NULL DEFAULT 'IT',
  responses JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX questionnaire_tokens_token_idx ON public.questionnaire_tokens(token);
CREATE INDEX questionnaire_tokens_assessment_idx ON public.questionnaire_tokens(assessment_id);

ALTER TABLE public.questionnaire_tokens ENABLE ROW LEVEL SECURITY;

-- Only authenticated users (consultants) can insert/delete
CREATE POLICY "Auth insert tokens" ON public.questionnaire_tokens
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth select tokens" ON public.questionnaire_tokens
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth delete tokens" ON public.questionnaire_tokens
  FOR DELETE TO authenticated USING (true);

-- SECURITY DEFINER functions bypass RLS for anon access
-- (same pattern as Risk Compass)

CREATE OR REPLACE FUNCTION public.get_questionnaire_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  assessment_id UUID,
  supplier_type TEXT,
  responses JSONB,
  status TEXT,
  expires_at TIMESTAMPTZ,
  supplier_name TEXT,
  supplier_email TEXT,
  assessment_title TEXT,
  project_name TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN RETURN; END IF;
  RETURN QUERY
  SELECT
    qt.id,
    qt.assessment_id,
    qt.supplier_type,
    qt.responses,
    qt.status,
    qt.expires_at,
    s.name         AS supplier_name,
    qt.supplier_email,
    a.title        AS assessment_title,
    p.name         AS project_name
  FROM public.questionnaire_tokens qt
  JOIN public.assessments  a ON a.id = qt.assessment_id
  JOIN public.suppliers    s ON s.id = a.supplier_id
  JOIN public.projects     p ON p.id = a.project_id
  WHERE qt.token = p_token
    AND qt.expires_at > now()
    AND qt.status <> 'completed'
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_questionnaire_progress(p_token TEXT, p_responses JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN RETURN FALSE; END IF;
  UPDATE public.questionnaire_tokens
  SET
    responses  = COALESCE(p_responses, '{}'::jsonb),
    status     = 'in_progress',
    updated_at = now()
  WHERE token = p_token
    AND expires_at > now()
    AND status <> 'completed';
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_questionnaire_token(
  p_token   TEXT,
  p_responses JSONB,
  p_score   INT,
  p_level   TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_assessment_id UUID;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN RETURN FALSE; END IF;

  SELECT assessment_id INTO v_assessment_id
  FROM public.questionnaire_tokens
  WHERE token = p_token
    AND expires_at > now()
    AND status <> 'completed';

  IF v_assessment_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.questionnaire_tokens
  SET
    responses    = COALESCE(p_responses, '{}'::jsonb),
    status       = 'completed',
    submitted_at = now(),
    updated_at   = now()
  WHERE token = p_token;

  UPDATE public.assessments
  SET status = 'completed', completed_at = now()
  WHERE id = v_assessment_id AND status = 'sent';

  RETURN TRUE;
END;
$$;

-- Grant anon execute on SECURITY DEFINER functions
GRANT EXECUTE ON FUNCTION public.get_questionnaire_token(TEXT)                        TO anon;
GRANT EXECUTE ON FUNCTION public.save_questionnaire_progress(TEXT, JSONB)             TO anon;
GRANT EXECUTE ON FUNCTION public.submit_questionnaire_token(TEXT, JSONB, INT, TEXT)   TO anon;

-- Allow anon to insert responses (needed for submit flow)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'responses' AND policyname = 'Anon insert responses'
  ) THEN
    CREATE POLICY "Anon insert responses" ON public.responses
      FOR INSERT TO anon WITH CHECK (true);
  END IF;
END;
$$;

-- Allow anon to read/write risk_scores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'risk_scores' AND policyname = 'Anon insert risk_scores'
  ) THEN
    CREATE POLICY "Anon insert risk_scores" ON public.risk_scores
      FOR INSERT TO anon WITH CHECK (true);
  END IF;
END;
$$;

-- Allow anon to read questions (needed for public questionnaire scoring)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'questions' AND policyname = 'Anon read questions'
  ) THEN
    CREATE POLICY "Anon read questions" ON public.questions
      FOR SELECT TO anon USING (true);
  END IF;
END;
$$;
