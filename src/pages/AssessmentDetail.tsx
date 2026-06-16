import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useStore } from "@/store/StoreContext";
import { computeRiskScore, levelLabel } from "@/lib/risk";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RiskBadge } from "@/components/RiskBadge";
import { StatusBadge } from "@/components/StatusBadge";
import {
  ChevronLeft, Send, CheckCircle2, XCircle, AlertTriangle, FileText, MessageSquare,
  Sparkles, Download, Loader2, ChevronDown, ChevronUp, Clock,
} from "lucide-react";
import { toast } from "sonner";
import type { DecisionType, RiskLevel } from "@/types";
import { AttachmentList } from "@/components/AttachmentList";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { generateRiskAnalysis, type AIAnalysis } from "@/lib/ai-analysis";
import { generateAssessmentPDF } from "@/lib/report-pdf";

const ANSWER_LABEL: Record<string, string> = {
  yes:     "Yes — fully implemented",
  partial: "Partially implemented",
  no:      "No — not implemented",
  na:      "Not applicable",
};

const ANSWER_COLOR: Record<string, string> = {
  yes:     "text-risk-low",
  partial: "text-risk-medium",
  no:      "text-risk-high",
  na:      "text-muted-foreground",
};

const LEVEL_COLOR: Record<RiskLevel, string> = {
  low:    "hsl(var(--risk-low))",
  medium: "hsl(var(--risk-medium))",
  high:   "hsl(var(--risk-high))",
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-l-4 border-risk-high bg-risk-high-soft",
  high:     "border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-950/20",
  medium:   "border-l-4 border-risk-medium bg-risk-medium-soft",
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-risk-high-soft text-risk-high",
  high:     "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  medium:   "bg-risk-medium-soft text-risk-medium",
};

function CategoryTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold mb-0.5">{d.cat}</div>
      <div className="text-muted-foreground">Score: <span className="font-mono font-bold text-foreground">{d.score}</span> / 100</div>
      <div className="mt-0.5 capitalize" style={{ color: LEVEL_COLOR[d.level as RiskLevel] }}>{d.level} risk</div>
    </div>
  );
}

export default function AssessmentDetail() {
  const { id } = useParams();
  const store = useStore();

  /* ── All hooks BEFORE any early return ── */
  const [decType,      setDecType]      = useState<DecisionType>("accept");
  const [decComment,   setDecComment]   = useState("");
  const [aiAnalysis,   setAiAnalysis]   = useState<AIAnalysis | null>(null);
  const [aiLoading,    setAiLoading]    = useState(false);
  const [aiError,      setAiError]      = useState<string | null>(null);
  const [auditLogs,    setAuditLogs]    = useState<any[]>([]);
  const [showAllAudit, setShowAllAudit] = useState(false);
  const [aiExpanded,   setAiExpanded]   = useState<Record<string, boolean>>({
    exec: true, gaps: true, roadmap: false, rationale: false,
  });

  const a          = store.assessments.find(x => x.id === id);
  const supplier   = a ? store.suppliers.find(s => s.id === a.supplierId) : undefined;
  const project    = a ? store.projects.find(p  => p.id === a.projectId)  : undefined;
  const responses  = a ? store.responses.filter(r => r.assessmentId === a.id) : [];
  const decision   = a ? store.decisions.find(d => d.assessmentId === a.id) : undefined;

  const result = useMemo(
    () => (responses.length && store.questions.length) ? computeRiskScore(store.questions, responses) : null,
    [responses, store.questions],
  );

  // Sync decision into form when it loads
  useEffect(() => {
    if (decision) {
      setDecType(decision.decision);
      setDecComment(decision.comment);
    }
  }, [decision?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load existing AI analysis from DB
  useEffect(() => {
    if (!a?.id) return;
    supabase
      .from("ai_risk_analyses")
      .select("*")
      .eq("assessment_id", a.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAiAnalysis({
            executive_summary:        data.executive_summary,
            overall_assessment:       data.overall_assessment ?? "",
            critical_gaps:            (data.critical_gaps        as any) ?? [],
            category_findings:        (data.category_findings    as any) ?? [],
            remediation_roadmap:      (data.remediation_roadmap  as any) ?? [],
            risk_acceptance_rationale: data.risk_acceptance_rationale ?? "",
          });
        }
      });
  }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load audit log entries for this assessment
  useEffect(() => {
    if (!a?.id) return;
    supabase
      .from("audit_logs")
      .select("*")
      .eq("entity_type", "assessment")
      .eq("entity_id", a.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setAuditLogs(data ?? []));
  }, [a?.id, store.assessments]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Early return AFTER all hooks ── */
  if (!a) return <Navigate to="/tprm" replace />;

  const isConsultant = store.currentUser?.role === "consultant";
  const isClient     = store.currentUser?.role === "client";

  function send() {
    store.updateAssessmentStatus(a.id, "sent");
    toast.success("Questionnaire sent to supplier");
  }
  function markReviewed() {
    store.updateAssessmentStatus(a.id, "reviewed");
    toast.success("Marked as reviewed");
  }
  function submitDecision() {
    if (!decComment.trim()) { toast.error("Please add a justification comment"); return; }
    store.recordDecision({ assessmentId: a.id, decision: decType, comment: decComment.trim(), decidedBy: store.currentUser!.id });
    toast.success(`Decision recorded: ${decType.replace(/_/g, " ")}`);
  }

  async function handleGenerateAI() {
    if (!result) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const analysis = await generateRiskAnalysis({
        supplierName:      supplier?.name     ?? "Unknown Supplier",
        supplierCategory:  supplier?.category ?? "",
        projectName:       project?.name      ?? "Unknown Project",
        assessmentTitle:   a.title,
        questions:         store.questions,
        responses,
        scoringResult:     result,
      });
      setAiAnalysis(analysis);

      // Persist to DB: delete old then insert fresh
      await supabase.from("ai_risk_analyses").delete().eq("assessment_id", a.id);
      await supabase.from("ai_risk_analyses").insert({
        assessment_id:             a.id,
        executive_summary:         analysis.executive_summary,
        overall_assessment:        analysis.overall_assessment,
        critical_gaps:             analysis.critical_gaps,
        category_findings:         analysis.category_findings,
        remediation_roadmap:       analysis.remediation_roadmap,
        risk_acceptance_rationale: analysis.risk_acceptance_rationale,
        generated_by:              store.currentUser?.id,
      });

      setAiExpanded({ exec: true, gaps: true, roadmap: true, rationale: true });
      toast.success("AI risk analysis generated and saved");
    } catch (err: any) {
      const msg = err.message ?? "Unknown error";
      setAiError(msg);
      toast.error("AI analysis failed — check your VITE_ANTHROPIC_API_KEY");
    } finally {
      setAiLoading(false);
    }
  }

  function handleExportPDF() {
    if (!result) return;
    generateAssessmentPDF({
      assessmentTitle:   a.title,
      supplierName:      supplier?.name          ?? "",
      supplierCategory:  supplier?.category      ?? "",
      supplierEmail:     supplier?.contactEmail  ?? "",
      projectName:       project?.name           ?? "",
      organizationName:  store.organizations.find(o => o.id === project?.organizationId)?.name ?? "",
      status:            a.status,
      sentAt:            a.sentAt,
      completedAt:       a.completedAt,
      questions:         store.questions,
      responses,
      scoringResult:     result,
      decision: decision ? {
        decision:   decision.decision,
        comment:    decision.comment,
        decidedAt:  decision.decidedAt,
        decidedBy:  decision.decidedBy,
      } : undefined,
      aiAnalysis: aiAnalysis ?? undefined,
    });
    toast.success("PDF report downloaded");
  }

  function toggleSection(key: string) {
    setAiExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Chart data
  const chartData = result
    ? Object.entries(result.byCategory).map(([cat, v]) => ({
        cat: cat.length > 14 ? cat.slice(0, 12) + "…" : cat,
        fullCat: cat,
        score: v.score,
        level: v.level,
      }))
    : [];

  const visibleAudit = showAllAudit ? auditLogs : auditLogs.slice(0, 5);

  return (
    <AppShell
      title={a.title}
      description={`${supplier?.name} · ${project?.name}`}
      actions={
        <Link to="/tprm" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-3 w-3" /> All assessments
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">

        {/* ── Left column ── */}
        <div className="space-y-6 lg:col-span-2">

          {/* Workflow stepper */}
          <div className="panel p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="stat-label mb-2">Workflow status</div>
                <StatusBadge status={a.status} />
              </div>
              {isConsultant && (
                <div className="flex gap-2">
                  {a.status === "draft" && (
                    <Button size="sm" onClick={send} className="gap-1.5">
                      <Send className="h-3.5 w-3.5" /> Send to supplier
                    </Button>
                  )}
                  {a.status === "completed" && (
                    <Button size="sm" variant="outline" onClick={markReviewed} className="gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> Mark reviewed
                    </Button>
                  )}
                </div>
              )}
            </div>
            <Stepper status={a.status} />
          </div>

          {/* ── AI Risk Analysis ── */}
          {result && (
            <div className="panel">
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <div>
                    <h3 className="text-sm font-semibold">AI Risk Analysis</h3>
                    <p className="text-xs text-muted-foreground">Powered by Claude Sonnet 4.6</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={aiAnalysis ? "outline" : "default"}
                  onClick={handleGenerateAI}
                  disabled={aiLoading}
                  className="gap-1.5 shrink-0"
                >
                  {aiLoading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing…</>
                  ) : aiAnalysis ? (
                    <><Sparkles className="h-3.5 w-3.5" /> Regenerate</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5" /> Generate analysis</>
                  )}
                </Button>
              </div>

              {aiError && (
                <div className="mx-6 mt-4 flex items-start gap-2 rounded-md border border-risk-high/30 bg-risk-high-soft p-3 text-xs text-risk-high">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              {!aiAnalysis && !aiLoading && !aiError && (
                <div className="flex flex-col items-center py-10 text-center">
                  <Sparkles className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Click <strong>Generate analysis</strong> to get an AI-powered risk report</p>
                  <p className="text-xs text-muted-foreground mt-1">References ISO 27001:2022, NIST CSF 2.0, SOC 2 Type II</p>
                </div>
              )}

              {aiAnalysis && (
                <div className="divide-y divide-border">

                  {/* Executive summary */}
                  <AISection
                    label="Executive Summary"
                    sectionKey="exec"
                    expanded={aiExpanded.exec}
                    onToggle={toggleSection}
                  >
                    {aiAnalysis.overall_assessment && (
                      <div className="mb-3 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-xs font-medium text-accent leading-relaxed">
                        {aiAnalysis.overall_assessment}
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {aiAnalysis.executive_summary}
                    </p>
                  </AISection>

                  {/* Critical gaps */}
                  {aiAnalysis.critical_gaps.length > 0 && (
                    <AISection
                      label={`Critical Gaps (${aiAnalysis.critical_gaps.length})`}
                      sectionKey="gaps"
                      expanded={aiExpanded.gaps}
                      onToggle={toggleSection}
                    >
                      <div className="space-y-3">
                        {aiAnalysis.critical_gaps.map((gap, i) => (
                          <div key={i} className={cn("rounded-md p-3", SEVERITY_STYLE[gap.severity] ?? "border-l-4 border-muted")}>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="text-sm font-semibold">{gap.area}</span>
                              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shrink-0", SEVERITY_BADGE[gap.severity])}>
                                {gap.severity}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{gap.description}</p>
                            <p className="text-xs font-medium text-accent">→ {gap.recommendation}</p>
                          </div>
                        ))}
                      </div>
                    </AISection>
                  )}

                  {/* Category findings */}
                  {aiAnalysis.category_findings.length > 0 && (
                    <AISection
                      label="Category Findings"
                      sectionKey="cats"
                      expanded={!!aiExpanded.cats}
                      onToggle={toggleSection}
                    >
                      <div className="space-y-4">
                        {aiAnalysis.category_findings.map((cf, i) => (
                          <div key={i}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold">{cf.category}</span>
                              <span className="font-mono text-xs text-muted-foreground">{cf.score}/100</span>
                              <span className="capitalize text-xs" style={{ color: LEVEL_COLOR[cf.level as RiskLevel] }}>{cf.level}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-1.5">{cf.analysis}</p>
                            {cf.recommendations.length > 0 && (
                              <ul className="space-y-0.5">
                                {cf.recommendations.map((rec, j) => (
                                  <li key={j} className="text-xs text-muted-foreground flex gap-1.5">
                                    <span className="text-accent shrink-0">•</span>{rec}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </AISection>
                  )}

                  {/* Remediation roadmap */}
                  {aiAnalysis.remediation_roadmap.length > 0 && (
                    <AISection
                      label={`Remediation Roadmap (${aiAnalysis.remediation_roadmap.length} items)`}
                      sectionKey="roadmap"
                      expanded={aiExpanded.roadmap}
                      onToggle={toggleSection}
                    >
                      <div className="space-y-3">
                        {aiAnalysis.remediation_roadmap.map((item, i) => (
                          <div key={i} className="flex gap-3">
                            <div className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                              item.priority === 1 ? "bg-risk-high" : item.priority === 2 ? "bg-risk-medium" : "bg-muted-foreground"
                            )}>
                              P{item.priority}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium leading-snug">{item.action}</p>
                              <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{item.framework_reference}</span>
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{item.timeline}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AISection>
                  )}

                  {/* Risk acceptance rationale */}
                  {aiAnalysis.risk_acceptance_rationale && (
                    <AISection
                      label="Risk Acceptance Rationale"
                      sectionKey="rationale"
                      expanded={aiExpanded.rationale}
                      onToggle={toggleSection}
                    >
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                        {aiAnalysis.risk_acceptance_rationale}
                      </p>
                    </AISection>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Questionnaire responses */}
          <div className="panel">
            <div className="border-b border-border px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Questionnaire Responses</h3>
                <p className="text-xs text-muted-foreground">{responses.length} of {store.questions.length} answered</p>
              </div>
            </div>

            {responses.length === 0 ? (
              <div className="flex flex-col items-center py-14 text-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">Awaiting supplier responses.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {store.questions.map((q, i) => {
                  const r = responses.find(x => x.questionId === q.id);
                  return (
                    <li key={q.id} className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug">{q.text}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="rounded bg-muted px-1.5 py-0.5">{q.category}</span>
                            <span>Weight {q.weight}</span>
                          </div>
                          {r && (
                            <div className={cn("mt-2 text-xs font-semibold", ANSWER_COLOR[r.answer])}>
                              {ANSWER_LABEL[r.answer]}
                            </div>
                          )}
                          {r?.comment && (
                            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-2">
                              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-accent" />
                              <span className="italic">{r.comment}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6">

          {/* Risk score */}
          <div className="panel p-6">
            <div className="stat-label mb-3">Risk Score</div>
            {result ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-5xl font-bold tracking-tight">{result.score}</span>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                </div>
                <div className="mt-2">
                  <RiskBadge level={result.level} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  {levelLabel(result.level)} — weighted across {Object.keys(result.byCategory).length} control categories.
                </p>

                {/* Category bar chart */}
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-xs font-semibold mb-3">Score by category</p>
                  <ResponsiveContainer width="100%" height={chartData.length * 36 + 16}>
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
                      barSize={12}
                    >
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis
                        type="category"
                        dataKey="cat"
                        width={90}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<CategoryTooltip />} cursor={{ fill: "hsl(var(--surface-muted))" }} />
                      <ReferenceLine x={85} stroke="hsl(var(--risk-low))"    strokeDasharray="3 3" strokeWidth={1} />
                      <ReferenceLine x={60} stroke="hsl(var(--risk-medium))" strokeDasharray="3 3" strokeWidth={1} />
                      <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                        {chartData.map((entry, idx) => (
                          <Cell key={idx} fill={LEVEL_COLOR[entry.level as RiskLevel]} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-risk-low   inline-block" />≥85 Low</span>
                    <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-risk-medium inline-block" />60–84 Med</span>
                    <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-risk-high  inline-block" />&lt;60 High</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">
                No score yet — awaiting completed responses.
              </p>
            )}
          </div>

          {/* PDF Export */}
          {result && (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleExportPDF}
            >
              <Download className="h-4 w-4" />
              Export PDF Report
            </Button>
          )}

          {/* Decision */}
          <div className="panel p-6">
            <div className="stat-label mb-3">Risk Decision</div>
            {decision ? (
              <div className="space-y-3">
                <DecisionPill decision={decision.decision} />
                <blockquote className="text-sm text-muted-foreground leading-relaxed border-l-2 border-border pl-3 italic">
                  "{decision.comment}"
                </blockquote>
                <p className="text-xs text-muted-foreground">Decided {decision.decidedAt}</p>
              </div>
            ) : (isConsultant || isClient) && result ? (
              <div className="space-y-3">
                <Select value={decType} onValueChange={v => setDecType(v as DecisionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accept">
                      <span className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-risk-low" />Accept</span>
                    </SelectItem>
                    <SelectItem value="accept_with_conditions">
                      <span className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-risk-medium" />Accept with conditions</span>
                    </SelectItem>
                    <SelectItem value="reject">
                      <span className="flex items-center gap-2"><XCircle className="h-3.5 w-3.5 text-risk-high" />Reject</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Justification, conditions, or remediation requirements…"
                  rows={4}
                  value={decComment}
                  onChange={e => setDecComment(e.target.value)}
                />
                <Button onClick={submitDecision} className="w-full">
                  Record decision
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                A decision can be recorded once the assessment is completed and scored.
              </p>
            )}
          </div>

          {/* Supplier info */}
          <div className="panel p-6 space-y-1">
            <div className="stat-label mb-2">Supplier</div>
            <div className="text-sm font-semibold">{supplier?.name}</div>
            <div className="text-xs text-muted-foreground">{supplier?.contactEmail}</div>
            <div className="text-xs text-muted-foreground">{supplier?.category}</div>
          </div>

          {/* Audit timeline */}
          {auditLogs.length > 0 && (
            <div className="panel">
              <div className="border-b border-border px-6 py-4">
                <h3 className="text-sm font-semibold">Activity Log</h3>
                <p className="text-xs text-muted-foreground">Assessment lifecycle events</p>
              </div>
              <ul className="divide-y divide-border">
                {visibleAudit.map((log: any) => (
                  <li key={log.id} className="flex items-start gap-3 px-6 py-3">
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{log.action.replace(/_/g, " ")}</p>
                      {log.performer_name && (
                        <p className="text-[11px] text-muted-foreground">{log.performer_name}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {auditLogs.length > 5 && (
                <button
                  onClick={() => setShowAllAudit(v => !v)}
                  className="flex w-full items-center justify-center gap-1 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border"
                >
                  {showAllAudit ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Show {auditLogs.length - 5} more</>}
                </button>
              )}
            </div>
          )}

          {project && (
            <AttachmentList entityType="assessment" entityId={a.id} projectId={project.id} />
          )}
        </div>
      </div>
    </AppShell>
  );
}

/* ─── AI Section accordion ─── */
function AISection({
  label, sectionKey, expanded, onToggle, children,
}: {
  label: string; sectionKey: string; expanded: boolean;
  onToggle: (k: string) => void; children: React.ReactNode;
}) {
  return (
    <div>
      <button
        className="flex w-full items-center justify-between px-6 py-3.5 text-left hover:bg-surface-muted transition-colors"
        onClick={() => onToggle(sectionKey)}
      >
        <span className="text-sm font-semibold">{label}</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {expanded && <div className="px-6 pb-5">{children}</div>}
    </div>
  );
}

/* ─── Stepper ─── */
function Stepper({ status }: { status: string }) {
  const steps = ["draft", "sent", "completed", "reviewed", "approved"];
  const isRejected = status === "rejected";
  const current = isRejected ? 4 : Math.max(0, steps.indexOf(status));

  return (
    <div className="mt-5 flex items-center gap-0">
      {steps.map((s, i) => {
        const done   = i < current || (i === current && !isRejected);
        const isLast = isRejected && i === 4;
        const active = i === current && !isRejected;
        return (
          <div key={s} className="flex flex-1 flex-col items-center gap-1.5">
            <div className={cn(
              "h-1.5 w-full rounded-full transition-colors",
              isLast   ? "bg-risk-high"
              : done   ? "bg-accent"
              : active ? "bg-accent/40"
              :          "bg-muted"
            )} />
            <span className={cn(
              "text-[10px] uppercase tracking-wide",
              (done || isLast) ? "font-semibold text-foreground" : "text-muted-foreground"
            )}>
              {isLast ? "Rejected" : s}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Decision pill ─── */
function DecisionPill({ decision }: { decision: DecisionType }) {
  const map = {
    accept:                 { label: "Accepted",               cls: "bg-risk-low-soft text-risk-low",    Icon: CheckCircle2  },
    accept_with_conditions: { label: "Accepted with conditions", cls: "bg-risk-medium-soft text-risk-medium", Icon: AlertTriangle },
    reject:                 { label: "Rejected",               cls: "bg-risk-high-soft text-risk-high",  Icon: XCircle      },
  } as const;
  const { label, cls, Icon } = map[decision];
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold", cls)}>
      <Icon className="h-4 w-4" />{label}
    </div>
  );
}
