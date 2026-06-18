import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { computeAdaptiveScore, type SupplierType } from "@/lib/adaptive-scoring";
import type { Question, AnswerValue } from "@/types";
import {
  CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck, Circle,
  MessageSquare, ClipboardCheck, Server, Building2, Clock, CheckCheck,
  AlertTriangle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Untyped client for new tables/functions not yet in generated types
const db = supabase as unknown as SupabaseClient;

interface TokenData {
  id: string;
  assessment_id: string;
  supplier_type: string;
  responses: Record<string, string>;
  status: string;
  expires_at: string;
  supplier_name: string;
  supplier_email: string;
  assessment_title: string;
  project_name: string;
}

type PageState = 'loading' | 'error' | 'active' | 'submitted';

const OPTIONS: { value: AnswerValue; label: string; desc: string; selectedClass: string }[] = [
  { value: "yes",     label: "Yes",       desc: "Fully implemented",     selectedClass: "border-risk-low/60 bg-risk-low-soft text-risk-low font-semibold" },
  { value: "partial", label: "Partially", desc: "Partially implemented", selectedClass: "border-risk-medium/60 bg-risk-medium-soft text-risk-medium font-semibold" },
  { value: "no",      label: "No",        desc: "Not implemented",        selectedClass: "border-risk-high/60 bg-risk-high-soft text-risk-high font-semibold" },
  { value: "na",      label: "N/A",       desc: "Not applicable",         selectedClass: "border-border bg-muted text-foreground font-semibold" },
];

const ANSWER_BADGE: Record<AnswerValue, { label: string; cls: string }> = {
  yes:     { label: "Yes",       cls: "bg-risk-low-soft text-risk-low border-risk-low/40" },
  partial: { label: "Partially", cls: "bg-risk-medium-soft text-risk-medium border-risk-medium/40" },
  no:      { label: "No",        cls: "bg-risk-high-soft text-risk-high border-risk-high/40" },
  na:      { label: "N/A",       cls: "bg-muted text-muted-foreground border-border" },
};

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PublicQuestionnaire() {
  const { token } = useParams<{ token: string }>();

  const [pageState,   setPageState]   = useState<PageState>('loading');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [tokenData,   setTokenData]   = useState<TokenData | null>(null);
  const [questions,   setQuestions]   = useState<Question[]>([]);
  const [answers,     setAnswers]     = useState<Record<string, AnswerValue>>({});
  const [comments,    setComments]    = useState<Record<string, string>>({});
  const [step,        setStep]        = useState(0);
  const [saving,      setSaving]      = useState(false);
  const [lastSaved,   setLastSaved]   = useState<Date | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  // Load token data + questions on mount
  useEffect(() => {
    if (!token) { setErrorMsg('Invalid link.'); setPageState('error'); return; }

    async function load() {
      const [tokenRes, questionRes] = await Promise.all([
        db.rpc('get_questionnaire_token', { p_token: token }),
        supabase.from('questions').select('*').order('sort_order'),
      ]);

      const rows = tokenRes.data as TokenData[] | null;
      if (tokenRes.error || !rows || rows.length === 0) {
        setErrorMsg('This link has expired or is no longer valid.');
        setPageState('error');
        return;
      }

      const td = rows[0];
      setTokenData(td);

      // Pre-fill any saved progress
      const savedResponses = td.responses as Record<string, string>;
      if (savedResponses && Object.keys(savedResponses).length > 0) {
        setAnswers(savedResponses as Record<string, AnswerValue>);
      }

      const qs = (questionRes.data ?? []).map((q: Record<string, unknown>) => ({
        id:       String(q.id),
        text:     String(q.text),
        category: String(q.category),
        weight:   Number(q.weight),
      }));
      setQuestions(qs);
      setPageState('active');
    }

    load().catch(() => {
      setErrorMsg('Failed to load questionnaire. Please try again.');
      setPageState('error');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-save debounced on answer change
  const autoSave = useCallback(async (currentAnswers: Record<string, AnswerValue>) => {
    if (!token || !tokenData) return;
    setSaving(true);
    await db.rpc('save_questionnaire_progress', {
      p_token:     token,
      p_responses: currentAnswers as unknown as Record<string, unknown>,
    });
    setSaving(false);
    setLastSaved(new Date());
  }, [token, tokenData]);

  useEffect(() => {
    if (pageState !== 'active' || Object.keys(answers).length === 0) return;
    const timer = setTimeout(() => { void autoSave(answers); }, 1500);
    return () => clearTimeout(timer);
  }, [answers, pageState, autoSave]);

  const grouped = useMemo(() => {
    const g: Record<string, Question[]> = {};
    for (const q of questions) (g[q.category] ??= []).push(q);
    return g;
  }, [questions]);

  const categories = useMemo(() => Object.keys(grouped), [grouped]);

  const supplierType: SupplierType =
    (tokenData?.supplier_type === 'Non-IT' ? 'Non-IT' : 'IT');

  const totalQuestions = questions.length;
  const answeredCount  = Object.keys(answers).length;
  const pct            = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const allAnswered    = answeredCount === totalQuestions && totalQuestions > 0;
  const isReview       = step === categories.length;

  function catAnswered(cat: string) {
    return grouped[cat]?.filter(q => answers[q.id] !== undefined).length ?? 0;
  }
  function catTotal(cat: string) { return grouped[cat]?.length ?? 0; }
  function catComplete(cat: string) {
    return catAnswered(cat) === catTotal(cat) && catTotal(cat) > 0;
  }

  function setAnswer(qid: string, val: AnswerValue) {
    setAnswers(prev => ({ ...prev, [qid]: val }));
  }
  function setComment(qid: string, val: string) {
    setComments(prev => ({ ...prev, [qid]: val }));
  }

  async function submit() {
    if (!allAnswered) { toast.error("Please answer all questions before submitting"); return; }
    if (!tokenData || !token) return;
    setSubmitting(true);
    try {
      // Insert individual response rows
      const rows = Object.entries(answers).map(([questionId, answer]) => ({
        assessment_id: tokenData.assessment_id,
        question_id:   questionId,
        answer,
        comment:       comments[questionId] ?? null,
      }));
      const { error: respErr } = await supabase.from('responses').insert(rows);
      if (respErr) throw new Error(respErr.message);

      // Compute adaptive score
      const responseObjects = rows.map((r, i) => ({
        id: String(i), assessmentId: r.assessment_id,
        questionId: r.question_id, answer: r.answer as AnswerValue,
      }));
      const scored = computeAdaptiveScore(questions, responseObjects, supplierType);

      // Insert risk score
      const { error: scoreErr } = await supabase.from('risk_scores').insert({
        assessment_id: tokenData.assessment_id,
        score:         scored.score,
        level:         scored.level,
      });
      if (scoreErr) {
        // Not fatal — assessment will still complete
        console.warn('risk_score insert:', scoreErr.message);
      }

      // Mark token + assessment completed
      const { data: ok, error: submitErr } = await db.rpc('submit_questionnaire_token', {
        p_token:     token,
        p_responses: answers as unknown as Record<string, unknown>,
        p_score:     scored.score,
        p_level:     scored.level,
      });
      if (submitErr) throw new Error(submitErr.message);
      if (!ok) throw new Error('Submission rejected — link may have expired.');

      setPageState('submitted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading questionnaire…</p>
        </div>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md w-full mx-4 text-center">
          <AlertTriangle className="h-12 w-12 text-risk-high mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Link Not Valid</h1>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <p className="text-xs text-muted-foreground mt-4">
            Contact your consultant to request a new link.
          </p>
        </div>
      </div>
    );
  }

  if (pageState === 'submitted') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md w-full mx-4 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-risk-low-soft">
            <CheckCheck className="h-8 w-8 text-risk-low" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Responses submitted</h1>
          <p className="text-sm text-muted-foreground">
            Thank you, <strong>{tokenData?.supplier_name}</strong>. Your security questionnaire for
            &ldquo;{tokenData?.assessment_title}&rdquo; has been received. The consultant will review
            your responses and be in touch.
          </p>
        </div>
      </div>
    );
  }

  const currentQuestions = isReview ? [] : (grouped[categories[step]] ?? []);
  const isIT = supplierType === 'IT';

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Logo />

          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
            {/* Auto-save indicator */}
            <span className={cn(
              "flex items-center gap-1 transition-opacity",
              saving ? "opacity-100" : lastSaved ? "opacity-60" : "opacity-0"
            )}>
              {saving
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                : <><CheckCircle2 className="h-3 w-3 text-risk-low" /> Saved</>}
            </span>

            {/* Expiry */}
            {tokenData?.expires_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Expires {formatExpiry(tokenData.expires_at)}
              </span>
            )}
          </div>

          {/* Supplier type badge */}
          <div className={cn(
            "hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            isIT
              ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          )}>
            {isIT ? <Server className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
            {supplierType} Supplier
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 pb-32">
        {/* Title */}
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-1.5">Security Questionnaire</p>
          <h1 className="text-2xl font-bold tracking-tight">{tokenData?.assessment_title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tokenData?.supplier_name} · {tokenData?.project_name}
          </p>
        </div>

        {/* IT / Non-IT tailored banner */}
        <div className={cn(
          "mb-5 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm",
          isIT
            ? "border-blue-500/30 bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300"
            : "border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300"
        )}>
          {isIT
            ? <Server className="h-4 w-4 shrink-0 opacity-70" />
            : <Building2 className="h-4 w-4 shrink-0 opacity-70" />}
          <span>
            This questionnaire has been tailored for{' '}
            <strong>{supplierType} suppliers</strong> — scoring weights are
            adjusted to reflect your risk profile.
          </span>
        </div>

        {/* Progress + category pills */}
        <div className="panel p-4 mb-6">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-medium text-foreground">Overall progress</span>
            <span className="font-mono text-muted-foreground">{answeredCount} / {totalQuestions}</span>
          </div>
          <Progress value={pct} className="h-2 mb-3" />
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat, i) => {
              const done    = catComplete(cat);
              const partial = catAnswered(cat) > 0 && !done;
              const active  = step === i && !isReview;
              return (
                <button
                  key={cat}
                  onClick={() => setStep(i)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
                    active   ? "bg-accent text-white shadow-sm"
                    : done   ? "bg-risk-low-soft text-risk-low"
                    : partial ? "bg-risk-medium-soft text-risk-medium"
                    :           "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {done
                    ? <CheckCircle2 className="h-3 w-3" />
                    : <Circle className="h-3 w-3 opacity-60" />}
                  {cat}
                  <span className="opacity-60 tabular-nums">{catAnswered(cat)}/{catTotal(cat)}</span>
                </button>
              );
            })}
            <button
              onClick={() => setStep(categories.length)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
                isReview ? "bg-accent text-white shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <ClipboardCheck className="h-3 w-3" />
              Review
            </button>
          </div>
        </div>

        {/* Step content */}
        {!isReview ? (
          <div key={step} className="animate-fade-in">
            <div className="panel overflow-hidden">
              <header className="flex items-center gap-2 border-b border-border bg-surface-muted px-5 py-3.5">
                <ShieldCheck className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-semibold">{categories[step]}</h2>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {catAnswered(categories[step])} / {catTotal(categories[step])} answered
                </span>
              </header>

              <ul className="divide-y divide-border">
                {currentQuestions.map((q) => {
                  const selected = answers[q.id];
                  return (
                    <li key={q.id} className="px-5 py-5 space-y-3">
                      <div>
                        <p className="text-sm font-medium leading-relaxed">{q.text}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Weight: {q.weight}</p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setAnswer(q.id, opt.value)}
                            className={cn(
                              "group flex flex-col items-center gap-0.5 rounded-lg border px-3 py-2.5 text-xs transition-all",
                              selected === opt.value
                                ? opt.selectedClass
                                : "border-border bg-card text-muted-foreground hover:border-accent/50 hover:text-foreground"
                            )}
                          >
                            <span className="text-sm font-semibold">{opt.label}</span>
                            <span className={cn(
                              "text-[10px] leading-none",
                              selected === opt.value ? "opacity-80" : "opacity-50 group-hover:opacity-70"
                            )}>
                              {opt.desc}
                            </span>
                          </button>
                        ))}
                      </div>

                      {selected && (
                        <div className="animate-fade-in">
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
                            <MessageSquare className="h-3 w-3" />
                            <span>Evidence / comment <span className="opacity-60">(optional)</span></span>
                          </div>
                          <Textarea
                            placeholder="Describe your controls, link to policy docs, or note exceptions…"
                            className="text-xs resize-none h-16 min-h-0"
                            value={comments[q.id] ?? ""}
                            onChange={e => setComment(q.id, e.target.value)}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : (
          /* ─── Review screen ─── */
          <div key="review" className="animate-fade-in space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardCheck className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-bold">Review your responses</h2>
            </div>

            {!allAnswered && (
              <div className="rounded-lg border border-risk-medium/40 bg-risk-medium-soft px-4 py-3 text-sm text-risk-medium">
                <strong>{totalQuestions - answeredCount} question{totalQuestions - answeredCount !== 1 ? "s" : ""} unanswered.</strong>
                {" "}Go back and complete them before submitting.
              </div>
            )}

            {categories.map((cat, i) => (
              <div key={cat} className="panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-surface-muted px-5 py-3">
                  <div className="flex items-center gap-2">
                    {catComplete(cat)
                      ? <CheckCircle2 className="h-4 w-4 text-risk-low" />
                      : <Circle className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-semibold">{cat}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {catAnswered(cat)}/{catTotal(cat)}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setStep(i)}>
                    Edit
                  </Button>
                </div>

                <ul className="divide-y divide-border">
                  {grouped[cat].map(q => {
                    const ans   = answers[q.id];
                    const comm  = comments[q.id];
                    const badge = ans ? ANSWER_BADGE[ans] : null;
                    return (
                      <li key={q.id} className="px-5 py-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground/80 leading-snug">{q.text}</p>
                          {comm && (
                            <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                              <span className="italic">{comm}</span>
                            </p>
                          )}
                        </div>
                        {badge ? (
                          <span className={cn("shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold", badge.cls)}>
                            {badge.label}
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground italic">
                            Unanswered
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Sticky navigation */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>

          {/* Step dots */}
          <div className="flex items-center gap-1">
            {categories.map((cat, i) => (
              <button
                key={cat}
                onClick={() => setStep(i)}
                aria-label={cat}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step && !isReview
                    ? "w-5 bg-accent"
                    : catComplete(cat)
                    ? "w-1.5 bg-risk-low"
                    : catAnswered(cat) > 0
                    ? "w-1.5 bg-risk-medium"
                    : "w-1.5 bg-muted"
                )}
              />
            ))}
            <button
              onClick={() => setStep(categories.length)}
              aria-label="Review"
              className={cn(
                "h-1.5 rounded-full transition-all",
                isReview ? "w-5 bg-accent" : "w-1.5 bg-muted"
              )}
            />
          </div>

          {isReview ? (
            <Button
              onClick={submit}
              disabled={!allAnswered || submitting}
              className="bg-accent hover:bg-accent/90 gap-1.5"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                : <><CheckCircle2 className="h-4 w-4" /> Submit responses</>}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setStep(s => s + 1)}
              className="bg-accent hover:bg-accent/90 gap-1"
            >
              {step === categories.length - 1 ? "Review" : "Next"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
