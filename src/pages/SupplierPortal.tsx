import { Link } from "react-router-dom";
import { useStore } from "@/store/StoreContext";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/RiskBadge";
import {
  ShieldCheck, ArrowRight, LogOut, Clock, CheckCircle2,
  FileText, Building2, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SupplierPortal() {
  const { currentUser, suppliers, assessments, projects, organizations, riskScores, decisions, logout } = useStore();
  const supplier = suppliers.find(s => s.id === currentUser?.supplierId);

  const myAssessments = assessments.filter(
    a => a.supplierId === supplier?.id && a.status !== "draft"
  );

  const pending   = myAssessments.filter(a => a.status === "sent");
  const submitted = myAssessments.filter(a => a.status !== "sent");

  const totalCount    = myAssessments.length;
  const pendingCount  = pending.length;
  const doneCount     = submitted.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Logo />
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-white">{currentUser?.name}</div>
              <div className="text-[11px] uppercase tracking-wider text-sidebar-primary">Supplier portal</div>
            </div>
            <Button
              onClick={logout}
              variant="ghost"
              size="sm"
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-white gap-1.5"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome, <span className="text-accent">{supplier?.name ?? currentUser?.name}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete the security questionnaires assigned to your organisation by your partners.
          </p>
        </div>

        {/* Stats strip */}
        {totalCount > 0 && (
          <div className="mb-8 grid grid-cols-3 gap-3">
            <StatCard label="Total" value={totalCount} icon={FileText} />
            <StatCard label="Pending" value={pendingCount} icon={Clock} accent={pendingCount > 0} />
            <StatCard label="Submitted" value={doneCount} icon={CheckCircle2} />
          </div>
        )}

        {/* Empty state */}
        {totalCount === 0 && (
          <div className="panel flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft mb-4">
              <ShieldCheck className="h-7 w-7 text-accent" />
            </div>
            <h3 className="text-sm font-semibold">No questionnaires yet</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              You'll see security questionnaires here once a consultant sends them to you.
            </p>
          </div>
        )}

        {/* Pending questionnaires */}
        {pending.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-risk-medium animate-pulse" />
              <h2 className="text-sm font-semibold">Awaiting your response</h2>
              <span className="rounded-full bg-risk-medium-soft px-2 py-0.5 text-[11px] font-medium text-risk-medium">
                {pending.length}
              </span>
            </div>
            <div className="space-y-3">
              {pending.map(a => {
                const project = projects.find(p => p.id === a.projectId);
                const org     = organizations.find(o => o.id === project?.organizationId);
                return (
                  <div key={a.id} className="panel p-5 flex items-center gap-4 border-l-4 border-l-accent">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{a.title}</div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />{org?.name}
                        </span>
                        <span>·</span>
                        <span>{project?.name}</span>
                        {a.sentAt && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />Sent {a.sentAt}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Button asChild size="sm" className="shrink-0 bg-accent hover:bg-accent/90 gap-1.5">
                      <Link to={`/supplier/questionnaire/${a.id}`}>
                        Fill out <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Submitted questionnaires */}
        {submitted.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-risk-low" />
              <h2 className="text-sm font-semibold">Submitted</h2>
              <span className="rounded-full bg-risk-low-soft px-2 py-0.5 text-[11px] font-medium text-risk-low">
                {submitted.length}
              </span>
            </div>
            <div className="space-y-2">
              {submitted.map(a => {
                const project  = projects.find(p => p.id === a.projectId);
                const org      = organizations.find(o => o.id === project?.organizationId);
                const score    = riskScores.find(r => r.assessmentId === a.id);
                const decision = decisions.find(d => d.assessmentId === a.id);
                return (
                  <div key={a.id} className="panel p-4 flex items-center gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-risk-low-soft">
                      <CheckCircle2 className="h-4.5 w-4.5 text-risk-low" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{a.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{org?.name}</span>
                        <span>·</span>
                        <span>{project?.name}</span>
                        {a.completedAt && (
                          <>
                            <span>·</span>
                            <span>Submitted {a.completedAt}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {score && <RiskBadge level={score.level} />}
                      {decision && (
                        <span className={cn(
                          "rounded-md border px-2 py-0.5 text-xs font-semibold",
                          decision.decision === "accept"
                            ? "bg-risk-low-soft text-risk-low border-risk-low/40"
                            : decision.decision === "reject"
                            ? "bg-risk-high-soft text-risk-high border-risk-high/40"
                            : "bg-risk-medium-soft text-risk-medium border-risk-medium/40"
                        )}>
                          {decision.decision === "accept"
                            ? "Accepted"
                            : decision.decision === "reject"
                            ? "Rejected"
                            : "Conditional"}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground border border-border rounded-md px-2 py-0.5">
                        Submitted
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: {
  label: string; value: number; icon: React.ElementType; accent?: boolean;
}) {
  return (
    <div className={cn("panel p-4", accent && "border-risk-medium/40")}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <Icon className={cn("h-4 w-4", accent ? "text-risk-medium" : "text-muted-foreground")} />
      </div>
      <div className={cn("font-mono text-2xl font-bold", accent && "text-risk-medium")}>{value}</div>
    </div>
  );
}
