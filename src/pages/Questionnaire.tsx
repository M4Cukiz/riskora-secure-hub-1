import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useStore } from "@/store/StoreContext";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck, Circle, MessageSquare, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import type { AnswerValue } from "@/types";
import { cn } from "@/lib/utils";

const OPTIONS: { value: AnswerValue; label: string; desc: string; selectedClass: string }[] = [
  { value: "yes",     label: "Yes",       desc: "Fully implemented",    selectedClass: "border-risk-low/60 bg-risk-low-soft text-risk-low font-semibold" },
  { value: "partial", label: "Partially", desc: "Partially implemented", selectedClass: "border-risk-medium/60 bg-risk-medium-soft text-risk-medium font-semibold" },
  { value: "no",      label: "No",        desc: "Not implemented",       selectedClass: "border-risk-high/60 bg-risk-high-soft text-risk-high font-semibold" },
  { value: "na",      label: "N/A",       desc: "Not applicable",        selectedClass: "border-border bg-muted text-foreground font-semibold" },
];

const ANSWER_BADGE: Record<AnswerValue, { label: string; cls: string }> = {
  yes:     { label: "Yes",       cls: "bg-risk-low-soft text-risk-low border-risk-low/40" },
  partial: { label: "Partially", cls: "bg-risk-medium-soft text-risk-medium border-risk-medium/40" },
  no:      { label: "No",        cls: "bg-risk-high-soft text-risk-high border-risk-high/40" },
  na:      { label: "N/A",       cls: "bg-muted text-muted-foreground border-border" },
};

export default function Questionnaire() {
  const { id } = useParams();
  const store = useStore();
  const navigate = useNavigate();

  // All hooks before any early returns
  const existing = useMemo(
    () => store.responses.filter(r => r.assessmentId === id),
    [store.responses, id]
  );

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() =>
    Object.fromEntries(existing.map(r => [r.questionId, r.answer]))
  );
  const [comments, setComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(existing.filter(r => r.comment).map(r => [r.questionId, r.comment!]))
  );
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<string, typeof store.questions> = {};
    for (const q of store.questions) (g[q.category] ??= []).push(q);
    return g;
  }, [store.questions]);

  const categories = useMemo(() => Object.keys(grouped), [grouped]);

  // Early returns after all hooks
  const a = store.assessments.find(x => x.id === id);
  if (!a) return <Navigate to="/supplier/portal" replace />;
  if (store.currentUser?.role === "supplier" && store.currentUser.supplierId !== a.supplierId) {
    return <Navigate to="/supplier/portal" replace />;
  }

  const supplier = store.suppliers.find(s => s.id === a.supplierId);
  const project  = store.projects.find(p => p.id === a.projectId);

  const totalQuestions = store.questions.length;
  const answeredCount  = Object.keys(answers).length;
  const pct            = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const allAnswered    = answeredCount === totalQuestions;
  const isReview       = step === categories.length;

  function catAnswered(cat: string) {
    return grouped[cat]?.filter(q => answers[q.id] !== undefined).length ?? 0;
  }
  function catTotal(cat: string) {
    return grouped[cat]?.length ?? 0;
  }
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
    setSubmitting(true);
    await store.saveResponses(a.id, answers, comments);
    toast.success("Questionnaire submitted successfully");
    navigate("/supplier/portal");
  }

  const currentQuestions = isReview ? [] : (grouped[categories[step]] ?? []);

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Logo />
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            {isReview ? (
              <span className="font-semibold text-foreground">Review &amp; Submit</span>
            ) : (
              <>
                <span className="tabular-nums">Step {step + 1} of {categories.length}</span>
                <span className="opacity-40">·</span>
                <span className="font-semibold text-foreground">{categories[step]}</span>
              </>
            )}
          </div>
          <Link to="/supplier/portal" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3 w-3" /> Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 pb-32">
        {/* Title */}
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-1.5">Security Questionnaire</p>
          <h1 className="text-2xl font-bold tracking-tight">{a.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{supplier?.name} · {project?.name}</p>
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
                </button>
              );
            })}
            <button
              onClick={() => setStep(categories.length)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
                isReview
                  ? "bg-accent text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <ClipboardCheck className="h-3 w-3" />
              Review
            </button>
          </div>
        </div>

        {/* Step content — keyed so React remounts on step change, triggering fade-in */}
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

                      {/* Answer options */}
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
                            <span className={cn("text-[10px] leading-none", selected === opt.value ? "opacity-80" : "opacity-50 group-hover:opacity-70")}>
                              {opt.desc}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Comment field — slides in after answering */}
                      {selected && (
                        <div className="animate-fade-in">
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1.5">
                            <MessageSquare className="h-3 w-3" />
                            <span>Evidence / comment <span className="opacity-60">(optional)</span></span>
                          </div>
                          <Textarea
                            placeholder="Describe your controls, link to policy docs, or note any exceptions…"
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
                {" "}Go back to complete them before submitting.
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
                    const ans  = answers[q.id];
                    const comm = comments[q.id];
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

      {/* Sticky navigation bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          {/* Back */}
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
            {/* Review dot */}
            <button
              onClick={() => setStep(categories.length)}
              aria-label="Review"
              className={cn(
                "h-1.5 rounded-full transition-all",
                isReview ? "w-5 bg-accent" : "w-1.5 bg-muted"
              )}
            />
          </div>

          {/* Next / Submit */}
          {isReview ? (
            <Button
              onClick={submit}
              disabled={!allAnswered || submitting}
              className="bg-accent hover:bg-accent/90 gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitting ? "Submitting…" : "Submit responses"}
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
