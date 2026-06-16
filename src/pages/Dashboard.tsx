import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useStore } from "@/store/StoreContext";
import { supabase } from "@/integrations/supabase/client";
import { RiskBadge } from "@/components/RiskBadge";
import { StatusBadge } from "@/components/StatusBadge";
import {
  ArrowUpRight, Building2, FolderKanban, ShieldCheck, AlertTriangle,
  ClipboardList, Code2, Bug, BookCheck, ListChecks,
} from "lucide-react";
import type { RiskLevel } from "@/types";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

interface ModuleCounts {
  risks: number;
  highRisks: number;
  requirements: number;
  codeFindings: number;
  pentestFindings: number;
  openPentest: number;
  frameworks: number;
  controlsImplemented: number;
  controlsTotal: number;
}

const EMPTY: ModuleCounts = {
  risks: 0, highRisks: 0, requirements: 0, codeFindings: 0,
  pentestFindings: 0, openPentest: 0, frameworks: 0,
  controlsImplemented: 0, controlsTotal: 0,
};

const RISK_COLORS: Record<RiskLevel, string> = {
  low:    "hsl(var(--risk-low))",
  medium: "hsl(var(--risk-medium))",
  high:   "hsl(var(--risk-high))",
};

const STATUS_ORDER = ["draft", "sent", "completed", "reviewed", "approved", "rejected"];
const STATUS_COLOR: Record<string, string> = {
  draft:     "hsl(var(--muted-foreground))",
  sent:      "hsl(var(--accent))",
  completed: "hsl(221 83% 63%)",
  reviewed:  "hsl(var(--risk-medium))",
  approved:  "hsl(var(--risk-low))",
  rejected:  "hsl(var(--risk-high))",
};

function RiskPieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <span className="font-semibold capitalize">{name} risk</span>
      <span className="ml-2 font-mono text-muted-foreground">{value} assessments</span>
    </div>
  );
}

function StatusBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <span className="font-semibold capitalize">{label}</span>
      <span className="ml-2 font-mono text-muted-foreground">{payload[0].value}</span>
    </div>
  );
}

export default function Dashboard() {
  const { projects, suppliers, assessments, riskScores, organizations, currentUser } = useStore();
  const [m, setM] = useState<ModuleCounts>(EMPTY);

  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    (async () => {
      const [
        { data: risks },
        { count: reqCount },
        { count: cfCount },
        { data: pf },
        { count: fwCount },
        { data: ctrls },
      ] = await Promise.all([
        supabase.from("risk_registers").select("id, risk_score"),
        supabase.from("security_requirements").select("id", { count: "exact", head: true }),
        supabase.from("code_review_findings").select("id", { count: "exact", head: true }),
        supabase.from("pentest_findings").select("id, status"),
        supabase.from("compliance_frameworks").select("id", { count: "exact", head: true }),
        supabase.from("compliance_controls").select("id, status"),
      ]);
      if (!active) return;
      setM({
        risks:               risks?.length ?? 0,
        highRisks:           (risks ?? []).filter((r: any) => (r.risk_score ?? 0) >= 15).length,
        requirements:        reqCount ?? 0,
        codeFindings:        cfCount ?? 0,
        pentestFindings:     pf?.length ?? 0,
        openPentest:         (pf ?? []).filter((x: any) => x.status === "open").length,
        frameworks:          fwCount ?? 0,
        controlsTotal:       ctrls?.length ?? 0,
        controlsImplemented: (ctrls ?? []).filter((c: any) => c.status === "implemented" || c.status === "verified").length,
      });
    })();
    return () => { active = false; };
  }, [currentUser]);

  // Risk distribution for pie chart
  const dist: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0 };
  for (const r of riskScores) dist[r.level]++;
  const pieData = (["low", "medium", "high"] as RiskLevel[])
    .filter(lvl => dist[lvl] > 0)
    .map(lvl => ({ name: lvl, value: dist[lvl], color: RISK_COLORS[lvl] }));
  const totalScored = riskScores.length;

  // Assessment status distribution for bar chart
  const statusCounts = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: 0 }), {});
  for (const a of assessments) statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
  const statusData = STATUS_ORDER
    .filter(s => statusCounts[s] > 0)
    .map(s => ({ status: s, count: statusCounts[s], fill: STATUS_COLOR[s] }));

  const compliancePct = m.controlsTotal
    ? Math.round((m.controlsImplemented / m.controlsTotal) * 100)
    : 0;

  const recent = [...assessments]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  const topStats = [
    { label: "Active Projects",     value: projects.filter(p => p.status === "active").length, icon: FolderKanban },
    { label: "Suppliers Tracked",   value: suppliers.length,     icon: Building2 },
    { label: "Assessments",         value: assessments.length,   icon: ShieldCheck },
    { label: "High-Risk Findings",  value: dist.high + m.highRisks, icon: AlertTriangle, accent: true },
  ];

  const moduleStats = [
    { label: "Risk Register",    value: m.risks,           sub: `${m.highRisks} high`,          to: "/modules/risk-analysis",          icon: AlertTriangle },
    { label: "Security Reqs",    value: m.requirements,    sub: "tracked",                       to: "/modules/security-requirements",  icon: ClipboardList },
    { label: "Code Findings",    value: m.codeFindings,    sub: "across reviews",                to: "/modules/secure-code-review",     icon: Code2 },
    { label: "Pentest Findings", value: m.pentestFindings, sub: `${m.openPentest} open`,         to: "/modules/security-testing",       icon: Bug },
    { label: "Compliance",       value: `${compliancePct}%`, sub: `${m.frameworks} framework${m.frameworks === 1 ? "" : "s"}`, to: "/modules/compliance", icon: BookCheck },
    { label: "TPRM",             value: assessments.length, sub: `${riskScores.length} scored`,  to: "/tprm",                           icon: ListChecks },
  ];

  return (
    <AppShell title="Dashboard" description="Security posture across all engagements">

      {/* Top KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {topStats.map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="panel p-5">
            <div className="flex items-start justify-between">
              <div className="stat-label">{label}</div>
              <Icon className={`h-4 w-4 ${accent ? "text-risk-high" : "text-muted-foreground"}`} />
            </div>
            <div className="mt-3 font-mono text-3xl font-bold tracking-tight">{value}</div>
          </div>
        ))}
      </div>

      {/* Module overview strip */}
      <div className="mt-6 panel">
        <div className="border-b border-border px-6 py-4">
          <h3 className="text-sm font-semibold">Modules Overview</h3>
          <p className="text-xs text-muted-foreground">Activity across all six security modules</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-border">
          {moduleStats.map(({ label, value, sub, to, icon: Icon }) => (
            <Link
              key={label}
              to={to}
              className="group flex flex-col gap-1 px-5 py-4 hover:bg-surface-muted transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="stat-label">{label}</span>
                <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
              <div className="font-mono text-2xl font-bold">{value}</div>
              <div className="text-[11px] text-muted-foreground">{sub}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Charts + recent row */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">

        {/* Risk distribution — pie chart */}
        <div className="panel p-6">
          <h3 className="text-sm font-semibold">Risk Distribution</h3>
          <p className="text-xs text-muted-foreground mb-4">Scored TPRM assessments</p>

          {totalScored > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip content={<RiskPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="mt-2 space-y-2">
                {(["low", "medium", "high"] as RiskLevel[]).map(lvl => {
                  const count = dist[lvl];
                  const pct   = totalScored > 0 ? Math.round((count / totalScored) * 100) : 0;
                  return (
                    <div key={lvl} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: RISK_COLORS[lvl] }} />
                      <span className="text-xs capitalize text-muted-foreground flex-1">{lvl}</span>
                      <span className="font-mono text-xs font-semibold">{count}</span>
                      <span className="text-[11px] text-muted-foreground w-8 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center text-center">
              <ShieldCheck className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No scored assessments yet</p>
            </div>
          )}

          {m.controlsTotal > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium">Compliance readiness</span>
                <span className="font-mono text-muted-foreground">{compliancePct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${compliancePct}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Assessment status bar chart */}
        <div className="panel p-6">
          <h3 className="text-sm font-semibold">Assessment Pipeline</h3>
          <p className="text-xs text-muted-foreground mb-4">Count by status</p>

          {assessments.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barSize={20}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  dataKey="status"
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={s => s.charAt(0).toUpperCase() + s.slice(1)}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<StatusBarTooltip />} cursor={{ fill: "hsl(var(--surface-muted))" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {statusData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center text-center">
              <ListChecks className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No assessments yet</p>
            </div>
          )}
        </div>

        {/* Recent assessments */}
        <div className="panel">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h3 className="text-sm font-semibold">Recent Assessments</h3>
              <p className="text-xs text-muted-foreground">Latest TPRM activity</p>
            </div>
            <Link to="/tprm" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {recent.length === 0 ? (
              <li className="px-6 py-8 text-center text-sm text-muted-foreground">No assessments yet.</li>
            ) : recent.map((a) => {
              const supplier = suppliers.find(s => s.id === a.supplierId);
              const project  = projects.find(p => p.id === a.projectId);
              const score    = riskScores.find(r => r.assessmentId === a.id);
              return (
                <li key={a.id}>
                  <Link
                    to={`/tprm/assessments/${a.id}`}
                    className="flex items-center gap-4 px-6 py-3.5 hover:bg-surface-muted transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{supplier?.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {project?.name} · {organizations.find(o => o.id === project?.organizationId)?.name}
                      </div>
                    </div>
                    {score && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-sm font-semibold">{score.score}</span>
                        <RiskBadge level={score.level} />
                      </div>
                    )}
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
