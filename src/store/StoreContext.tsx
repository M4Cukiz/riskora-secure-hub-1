import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  Assessment, AssessmentStatus, Decision, DecisionType, Organization,
  Project, Question, Response, RiskScore, Role, Supplier, User,
} from "@/types";
import { computeRiskScore } from "@/lib/risk";
import { toast } from "sonner";

interface StoreState {
  users: User[];
  organizations: Organization[];
  projects: Project[];
  suppliers: Supplier[];
  assessments: Assessment[];
  responses: Response[];
  riskScores: RiskScore[];
  decisions: Decision[];
  questions: Question[];
  currentUser: User | null;
  loading: boolean;
}

interface StoreContextValue extends StoreState {
  refresh: () => Promise<void>;
  logout: () => Promise<void>;

  createProject: (input: { name: string; description: string; organizationId: string }) => Promise<Project | null>;
  createOrganization: (input: { name: string }) => Promise<Organization | null>;
  createSupplier: (input: { name: string; organizationId: string; contactEmail: string; category: string }) => Promise<Supplier | null>;
  createAssessment: (input: { projectId: string; supplierId: string; title: string }) => Promise<Assessment | null>;
  updateAssessmentStatus: (id: string, status: AssessmentStatus) => Promise<void>;
  saveResponses: (assessmentId: string, answers: Record<string, Response["answer"]>) => Promise<void>;
  recordDecision: (input: { assessmentId: string; decision: DecisionType; comment: string; decidedBy: string }) => Promise<void>;

  createInvite: (input: {
    email: string;
    role: Extract<Role, "client" | "supplier">;
    orgId?: string;
    projectId?: string;
    supplierId?: string;
  }) => Promise<{ token: string } | null>;
  invites: any[];
  loadInvites: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const empty: StoreState = {
  users: [], organizations: [], projects: [], suppliers: [],
  assessments: [], responses: [], riskScores: [], decisions: [],
  questions: [], currentUser: null, loading: true,
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(empty);
  const [invites, setInvites] = useState<any[]>([]);

  const loadAll = useCallback(async (userId: string | null) => {
    if (!userId) {
      setState({ ...empty, loading: false });
      return;
    }

    // Fetch profile + roles for the current user
    const [{ data: profileRow }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("id, name, email").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    const role: Role = (roleRows?.[0]?.role as Role) ?? "consultant";

    // Find supplier link if any
    let supplierIdForUser: string | undefined;
    if (role === "supplier") {
      const { data: sup } = await supabase.from("suppliers").select("id").eq("user_id", userId).maybeSingle();
      supplierIdForUser = sup?.id;
    }

    // Find org membership for clients
    let orgIdForUser: string | undefined;
    let assignedProjectIds: string[] | undefined;
    if (role === "client") {
      const { data: mem } = await supabase.from("org_members").select("org_id").eq("user_id", userId).maybeSingle();
      orgIdForUser = mem?.org_id;
      const { data: pcs } = await supabase.from("project_clients").select("project_id").eq("user_id", userId);
      assignedProjectIds = pcs?.map((p: any) => p.project_id) ?? [];
    }

    const currentUser: User = {
      id: userId,
      name: profileRow?.name ?? "",
      email: profileRow?.email ?? "",
      role,
      supplierId: supplierIdForUser,
      organizationId: orgIdForUser,
      assignedProjectIds,
    };

    // Fetch domain data — RLS will scope automatically per role
    const [
      { data: orgs },
      { data: projects },
      { data: suppliers },
      { data: assessments },
      { data: responses },
      { data: riskScores },
      { data: decisions },
      { data: questions },
    ] = await Promise.all([
      supabase.from("organizations").select("*").order("created_at"),
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("suppliers").select("*").order("created_at", { ascending: false }),
      supabase.from("assessments").select("*").order("created_at", { ascending: false }),
      supabase.from("responses").select("*"),
      supabase.from("risk_scores").select("*"),
      supabase.from("decisions").select("*"),
      supabase.from("questions").select("*").order("sort_order"),
    ]);

    setState({
      loading: false,
      currentUser,
      users: [currentUser],
      organizations: (orgs ?? []).map((o: any) => ({ id: o.id, name: o.name })),
      projects: (projects ?? []).map((p: any) => ({
        id: p.id, name: p.name, description: p.description ?? "",
        organizationId: p.org_id, status: p.status,
        createdAt: (p.created_at ?? "").slice(0, 10),
      })),
      suppliers: (suppliers ?? []).map((s: any) => ({
        id: s.id, name: s.name, organizationId: s.org_id,
        contactEmail: s.contact_email, category: s.category ?? "",
      })),
      assessments: (assessments ?? []).map((a: any) => ({
        id: a.id, projectId: a.project_id, supplierId: a.supplier_id,
        title: a.title, status: a.status,
        createdAt: (a.created_at ?? "").slice(0, 10),
        sentAt: a.sent_at ? a.sent_at.slice(0, 10) : undefined,
        completedAt: a.completed_at ? a.completed_at.slice(0, 10) : undefined,
      })),
      responses: (responses ?? []).map((r: any) => ({
        id: r.id, assessmentId: r.assessment_id, questionId: r.question_id,
        answer: r.answer, comment: r.comment ?? undefined,
      })),
      riskScores: (riskScores ?? []).map((r: any) => ({
        id: r.id, assessmentId: r.assessment_id, score: r.score, level: r.level,
        computedAt: (r.computed_at ?? "").slice(0, 10),
      })),
      decisions: (decisions ?? []).map((d: any) => ({
        id: d.id, assessmentId: d.assessment_id, decision: d.decision,
        comment: d.comment ?? "", decidedBy: d.decided_by ?? "",
        decidedAt: (d.decided_at ?? "").slice(0, 10),
      })),
      questions: (questions ?? []).map((q: any) => ({
        id: q.id, text: q.text, category: q.category, weight: q.weight,
      })),
    });
  }, []);

  useEffect(() => {
    let active = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      // Defer to avoid running queries inside the callback synchronously
      setTimeout(() => loadAll(session?.user?.id ?? null), 0);
    });

    // Then check existing session
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      loadAll(data.session?.user?.id ?? null);
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, [loadAll]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadAll(data.session?.user?.id ?? null);
  }, [loadAll]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const createOrganization: StoreContextValue["createOrganization"] = useCallback(async ({ name }) => {
    const { data, error } = await supabase.from("organizations").insert({ name }).select().single();
    if (error) { toast.error(error.message); return null; }
    await refresh();
    return { id: data.id, name: data.name };
  }, [refresh]);

  const createProject: StoreContextValue["createProject"] = useCallback(async ({ name, description, organizationId }) => {
    const { data, error } = await supabase.from("projects").insert({
      name, description, org_id: organizationId,
    }).select().single();
    if (error) { toast.error(error.message); return null; }
    await refresh();
    return { id: data.id, name: data.name, description: data.description, organizationId: data.org_id, status: data.status, createdAt: data.created_at.slice(0,10) };
  }, [refresh]);

  const createSupplier: StoreContextValue["createSupplier"] = useCallback(async ({ name, organizationId, contactEmail, category }) => {
    const { data, error } = await supabase.from("suppliers").insert({
      name, org_id: organizationId, contact_email: contactEmail, category,
    }).select().single();
    if (error) { toast.error(error.message); return null; }
    await refresh();
    return { id: data.id, name: data.name, organizationId: data.org_id, contactEmail: data.contact_email, category: data.category };
  }, [refresh]);

  const createAssessment: StoreContextValue["createAssessment"] = useCallback(async ({ projectId, supplierId, title }) => {
    const { data, error } = await supabase.from("assessments").insert({
      project_id: projectId, supplier_id: supplierId, title,
    }).select().single();
    if (error) { toast.error(error.message); return null; }
    await refresh();
    return {
      id: data.id, projectId: data.project_id, supplierId: data.supplier_id,
      title: data.title, status: data.status, createdAt: data.created_at.slice(0,10),
    };
  }, [refresh]);

  const updateAssessmentStatus: StoreContextValue["updateAssessmentStatus"] = useCallback(async (id, status) => {
    const patch: any = { status };
    if (status === "sent") patch.sent_at = new Date().toISOString();
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from("assessments").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await refresh();
  }, [refresh]);

  const saveResponses: StoreContextValue["saveResponses"] = useCallback(async (assessmentId, answers) => {
    // Delete existing then insert
    const { error: delErr } = await supabase.from("responses").delete().eq("assessment_id", assessmentId);
    if (delErr) { toast.error(delErr.message); return; }

    const rows = Object.entries(answers).map(([question_id, answer]) => ({
      assessment_id: assessmentId, question_id, answer,
    }));
    if (rows.length) {
      const { error: insErr } = await supabase.from("responses").insert(rows);
      if (insErr) { toast.error(insErr.message); return; }
    }

    // Compute score on client (questions are public-readable)
    const result = computeRiskScore(state.questions, rows.map((r, i) => ({
      id: String(i), assessmentId, questionId: r.question_id, answer: r.answer,
    })));

    // Upsert score
    await supabase.from("risk_scores").delete().eq("assessment_id", assessmentId);
    const { error: scoreErr } = await supabase.from("risk_scores").insert({
      assessment_id: assessmentId, score: result.score, level: result.level,
    });
    if (scoreErr) { toast.error(scoreErr.message); return; }

    // Mark assessment completed
    await supabase.from("assessments").update({
      status: "completed", completed_at: new Date().toISOString(),
    }).eq("id", assessmentId);

    await refresh();
  }, [state.questions, refresh]);

  const recordDecision: StoreContextValue["recordDecision"] = useCallback(async ({ assessmentId, decision, comment, decidedBy }) => {
    await supabase.from("decisions").delete().eq("assessment_id", assessmentId);
    const { error } = await supabase.from("decisions").insert({
      assessment_id: assessmentId, decision, comment, decided_by: decidedBy,
    });
    if (error) { toast.error(error.message); return; }
    await supabase.from("assessments").update({
      status: decision === "reject" ? "rejected" : "approved",
    }).eq("id", assessmentId);
    await refresh();
  }, [refresh]);

  const createInvite: StoreContextValue["createInvite"] = useCallback(async ({ email, role, orgId, projectId, supplierId }) => {
    const { data, error } = await supabase.from("invites").insert({
      email: email.toLowerCase().trim(), role, org_id: orgId ?? null,
      project_id: projectId ?? null, supplier_id: supplierId ?? null,
    }).select("token").single();
    if (error) { toast.error(error.message); return null; }
    return { token: data.token };
  }, []);

  const loadInvites = useCallback(async () => {
    const { data } = await supabase.from("invites").select("*").order("created_at", { ascending: false });
    setInvites(data ?? []);
  }, []);

  const value: StoreContextValue = {
    ...state,
    refresh,
    logout,
    createOrganization,
    createProject,
    createSupplier,
    createAssessment,
    updateAssessmentStatus,
    saveResponses,
    recordDecision,
    createInvite,
    invites,
    loadInvites,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
