-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('consultant', 'client', 'supplier');
CREATE TYPE public.project_status AS ENUM ('active', 'completed');
CREATE TYPE public.assessment_status AS ENUM ('draft','sent','completed','reviewed','approved','rejected');
CREATE TYPE public.answer_value AS ENUM ('yes','partial','no','na');
CREATE TYPE public.risk_level AS ENUM ('low','medium','high');
CREATE TYPE public.decision_type AS ENUM ('accept','accept_with_conditions','reject');
CREATE TYPE public.invite_status AS ENUM ('pending','accepted','revoked');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_role_is(_role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), _role)
$$;

-- ============ ORGANIZATIONS ============
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_org_member(_user UUID, _org UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.org_members WHERE user_id=_user AND org_id=_org) $$;

-- ============ PROJECTS ============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status project_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
ALTER TABLE public.project_clients ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_project_access(_user UUID, _project UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_clients WHERE user_id=_user AND project_id=_project)
      OR EXISTS (SELECT 1 FROM public.projects p
                 JOIN public.org_members m ON m.org_id=p.org_id
                 WHERE p.id=_project AND m.user_id=_user)
$$;

-- ============ SUPPLIERS ============
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_email TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_supplier_user(_user UUID, _supplier UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.suppliers WHERE id=_supplier AND user_id=_user) $$;

-- ============ QUESTIONS ============
CREATE TABLE public.questions (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  weight INT NOT NULL CHECK (weight BETWEEN 1 AND 5),
  text TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- ============ ASSESSMENTS ============
CREATE TABLE public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status assessment_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_assessment(_user UUID, _assessment UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user, 'consultant')
      OR EXISTS (
        SELECT 1 FROM public.assessments a
        WHERE a.id = _assessment
          AND ( public.is_supplier_user(_user, a.supplier_id)
             OR public.has_project_access(_user, a.project_id) )
      )
$$;

-- ============ RESPONSES ============
CREATE TABLE public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer answer_value NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assessment_id, question_id)
);
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- ============ RISK SCORES ============
CREATE TABLE public.risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL UNIQUE REFERENCES public.assessments(id) ON DELETE CASCADE,
  score INT NOT NULL,
  level risk_level NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_scores ENABLE ROW LEVEL SECURITY;

-- ============ DECISIONS ============
CREATE TABLE public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL UNIQUE REFERENCES public.assessments(id) ON DELETE CASCADE,
  decision decision_type NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

-- ============ INVITES ============
CREATE TABLE public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  email TEXT NOT NULL,
  role app_role NOT NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status invite_status NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============

-- profiles
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles consultants read all" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'consultant'));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- user_roles
CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "roles consultant read all" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'consultant'));

-- organizations
CREATE POLICY "orgs consultant manage" ON public.organizations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'consultant')) WITH CHECK (public.has_role(auth.uid(),'consultant'));
CREATE POLICY "orgs members read" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), id));

-- org_members
CREATE POLICY "orgmem consultant manage" ON public.org_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'consultant')) WITH CHECK (public.has_role(auth.uid(),'consultant'));
CREATE POLICY "orgmem self read" ON public.org_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- projects
CREATE POLICY "projects consultant manage" ON public.projects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'consultant')) WITH CHECK (public.has_role(auth.uid(),'consultant'));
CREATE POLICY "projects client read" ON public.projects FOR SELECT TO authenticated
  USING (public.has_project_access(auth.uid(), id));

-- project_clients
CREATE POLICY "pc consultant manage" ON public.project_clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'consultant')) WITH CHECK (public.has_role(auth.uid(),'consultant'));
CREATE POLICY "pc self read" ON public.project_clients FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- suppliers
CREATE POLICY "suppliers consultant manage" ON public.suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'consultant')) WITH CHECK (public.has_role(auth.uid(),'consultant'));
CREATE POLICY "suppliers client read" ON public.suppliers FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "suppliers self read" ON public.suppliers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- questions (public read for any signed-in user)
CREATE POLICY "questions read" ON public.questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "questions consultant manage" ON public.questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'consultant')) WITH CHECK (public.has_role(auth.uid(),'consultant'));

-- assessments
CREATE POLICY "assessments consultant manage" ON public.assessments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'consultant')) WITH CHECK (public.has_role(auth.uid(),'consultant'));
CREATE POLICY "assessments client read" ON public.assessments FOR SELECT TO authenticated
  USING (public.has_project_access(auth.uid(), project_id));
CREATE POLICY "assessments supplier read" ON public.assessments FOR SELECT TO authenticated
  USING (public.is_supplier_user(auth.uid(), supplier_id));

-- responses
CREATE POLICY "responses consultant manage" ON public.responses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'consultant')) WITH CHECK (public.has_role(auth.uid(),'consultant'));
CREATE POLICY "responses viewable" ON public.responses FOR SELECT TO authenticated
  USING (public.can_view_assessment(auth.uid(), assessment_id));
CREATE POLICY "responses supplier write" ON public.responses FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND public.is_supplier_user(auth.uid(), a.supplier_id))
  );
CREATE POLICY "responses supplier update" ON public.responses FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND public.is_supplier_user(auth.uid(), a.supplier_id))
  );

-- risk_scores
CREATE POLICY "scores consultant manage" ON public.risk_scores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'consultant')) WITH CHECK (public.has_role(auth.uid(),'consultant'));
CREATE POLICY "scores viewable" ON public.risk_scores FOR SELECT TO authenticated
  USING (public.can_view_assessment(auth.uid(), assessment_id));
CREATE POLICY "scores supplier write" ON public.risk_scores FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND public.is_supplier_user(auth.uid(), a.supplier_id))
  );
CREATE POLICY "scores supplier update" ON public.risk_scores FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND public.is_supplier_user(auth.uid(), a.supplier_id))
  );

-- decisions
CREATE POLICY "decisions consultant manage" ON public.decisions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'consultant')) WITH CHECK (public.has_role(auth.uid(),'consultant'));
CREATE POLICY "decisions viewable" ON public.decisions FOR SELECT TO authenticated
  USING (public.can_view_assessment(auth.uid(), assessment_id));

-- invites
CREATE POLICY "invites consultant manage" ON public.invites FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'consultant')) WITH CHECK (public.has_role(auth.uid(),'consultant'));
-- Note: invite acceptance happens via SECURITY DEFINER function (no direct read needed by invitee)

-- ============ HANDLE NEW USER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token TEXT;
  v_invite RECORD;
  v_full_name TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, v_full_name, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  v_token := NEW.raw_user_meta_data->>'invite_token';

  IF v_token IS NOT NULL THEN
    SELECT * INTO v_invite FROM public.invites
      WHERE token = v_token AND status = 'pending'
      AND lower(email) = lower(NEW.email)
      LIMIT 1;

    IF FOUND THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_invite.role)
        ON CONFLICT DO NOTHING;

      IF v_invite.role = 'client' AND v_invite.org_id IS NOT NULL THEN
        INSERT INTO public.org_members (org_id, user_id) VALUES (v_invite.org_id, NEW.id)
          ON CONFLICT DO NOTHING;
        IF v_invite.project_id IS NOT NULL THEN
          INSERT INTO public.project_clients (project_id, user_id) VALUES (v_invite.project_id, NEW.id)
            ON CONFLICT DO NOTHING;
        END IF;
      ELSIF v_invite.role = 'supplier' AND v_invite.supplier_id IS NOT NULL THEN
        UPDATE public.suppliers SET user_id = NEW.id WHERE id = v_invite.supplier_id;
      END IF;

      UPDATE public.invites SET status='accepted', accepted_at=now() WHERE id = v_invite.id;
      RETURN NEW;
    END IF;
  END IF;

  -- Default: self-signup => consultant
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'consultant')
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ SEED QUESTIONS ============
INSERT INTO public.questions (id, category, weight, text, sort_order) VALUES
('q1','Access Control',5,'Do you enforce multi-factor authentication (MFA) for all administrative accounts?',1),
('q2','Access Control',4,'Do you apply the principle of least privilege when granting access to systems handling client data?',2),
('q3','Access Control',3,'Are user access rights reviewed at least quarterly?',3),
('q4','Data Protection',5,'Is client data encrypted at rest using industry-standard algorithms (AES-256 or equivalent)?',4),
('q5','Data Protection',5,'Is data encrypted in transit using TLS 1.2 or higher?',5),
('q6','Data Protection',4,'Do you have a documented data retention and secure deletion policy?',6),
('q7','Incident Response',5,'Do you have a documented incident response plan tested at least annually?',7),
('q8','Incident Response',4,'Will you notify clients of a security breach within 72 hours of detection?',8),
('q9','Business Continuity',3,'Do you maintain a tested business continuity and disaster recovery plan?',9),
('q10','Business Continuity',3,'Are backups encrypted and stored in a geographically separate location?',10),
('q11','Compliance',4,'Do you hold a current ISO 27001, SOC 2 Type II, or equivalent certification?',11),
('q12','Compliance',3,'Do you comply with applicable data protection regulations (GDPR, CCPA, etc.)?',12),
('q13','Personnel',3,'Do all employees with access to client data undergo background screening?',13),
('q14','Personnel',2,'Is annual security awareness training mandatory for all staff?',14),
('q15','Vendor Management',4,'Do you assess the security posture of your own subcontractors handling client data?',15);