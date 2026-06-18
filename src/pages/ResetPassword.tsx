import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

type PageState = "waiting" | "ready" | "done" | "expired";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>("waiting");
  const [password, setPassword]   = useState("");
  const [confirm,  setConfirm]    = useState("");
  const [busy,     setBusy]       = useState(false);

  useEffect(() => {
    // Supabase v2 exchanges the token from the URL hash/code automatically.
    // Listen for PASSWORD_RECOVERY to know when the session is ready.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPageState("ready");
      }
    });

    // Also check if we already have a recovery session (page refresh case)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPageState("ready");
    });

    // If nothing fires in 8 seconds, the link is probably expired
    const timeout = setTimeout(() => {
      setPageState(s => s === "waiting" ? "expired" : s);
    }, 8000);

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setPageState("done");
    setTimeout(() => navigate("/dashboard"), 2000);
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left panel — matches Login.tsx */}
      <div className="relative hidden lg:flex flex-col justify-between bg-sidebar p-12 text-sidebar-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(hsl(var(--accent))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--accent))_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative"><Logo /></div>
        <div className="relative space-y-4">
          <ShieldCheck className="h-10 w-10 text-accent" />
          <h2 className="max-w-md text-4xl font-bold leading-tight text-white">
            Set a new password
          </h2>
          <p className="max-w-md text-sidebar-foreground/70">
            Choose a strong password — at least 8 characters, mixing letters and numbers.
          </p>
        </div>
        <div className="relative text-xs text-sidebar-foreground/50">© 2025 Riskora — Cybersecurity Consulting Platform</div>
      </div>

      {/* Right panel */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8"><Logo /></div>

          {pageState === "waiting" && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground py-12">
              <Loader2 className="h-7 w-7 animate-spin" />
              <p className="text-sm">Verifying reset link…</p>
            </div>
          )}

          {pageState === "expired" && (
            <div className="text-center space-y-4">
              <h1 className="text-2xl font-bold">Link expired</h1>
              <p className="text-sm text-muted-foreground">
                This password reset link is no longer valid. Please request a new one.
              </p>
              <Button onClick={() => navigate("/login")} variant="outline" className="mt-2">
                Back to sign in
              </Button>
            </div>
          )}

          {pageState === "done" && (
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-risk-low-soft">
                <CheckCircle2 className="h-7 w-7 text-risk-low" />
              </div>
              <h1 className="text-2xl font-bold">Password updated</h1>
              <p className="text-sm text-muted-foreground">Redirecting you to your dashboard…</p>
            </div>
          )}

          {pageState === "ready" && (
            <>
              <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your new password below. Minimum 8 characters.
              </p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    minLength={8}
                  />
                  {confirm && password !== confirm && (
                    <p className="text-[11px] text-risk-high">Passwords do not match.</p>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={busy || password !== confirm || password.length < 8}
                  className="w-full bg-accent hover:bg-accent/90"
                >
                  {busy
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <>Update password <ArrowRight className="ml-2 h-4 w-4" /></>}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
