import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/store/StoreContext";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";

export default function Login() {
  const { currentUser, loading } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteToken = params.get("invite") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"signin" | "signup" | "forgot">(inviteToken ? "signup" : "signin");
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => { if (inviteToken) setTab("signup"); }, [inviteToken]);

  if (loading) return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (currentUser) return <Navigate to={destinationFor(currentUser.role)} replace />;

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome back");
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: name.trim(), invite_token: inviteToken || undefined },
      },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Account created — signing you in…");
  }

  async function sendResetEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setResetSent(true);
  }

  async function google() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) { setBusy(false); toast.error("Google sign-in failed"); return; }
    if (result.redirected) return;
    setBusy(false);
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden lg:flex flex-col justify-between bg-sidebar p-12 text-sidebar-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(hsl(var(--accent))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--accent))_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative"><Logo /></div>
        <div className="relative space-y-8">
          <h2 className="max-w-md text-4xl font-bold leading-tight text-white">
            Manage third-party risk like a security team, not a spreadsheet.
          </h2>
          <p className="max-w-md text-sidebar-foreground/70">
            Riskora unifies vendor assessments, scoring and decisions across every engagement — purpose-built for cybersecurity consulting firms.
          </p>
        </div>
        <div className="relative text-xs text-sidebar-foreground/50">© 2025 Riskora — Cybersecurity Consulting Platform</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8"><Logo /></div>
          <h1 className="text-2xl font-bold tracking-tight">
            {inviteToken ? "Accept your invitation" : "Sign in to your workspace"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {inviteToken
              ? "Create your account to join the workspace you were invited to."
              : "New consultants sign up below; clients & suppliers join via invite."}
          </p>

          <div className="mt-6">
            <Button type="button" onClick={google} disabled={busy} variant="outline" className="w-full">
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              Continue with Google
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">or with email</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Tabs value={tab} onValueChange={(v) => { setTab(v as "signin" | "signup" | "forgot"); setResetSent(false); }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">{inviteToken ? "Accept invite" : "Sign up"}</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="mt-4">
              <form onSubmit={signIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => { setResetSent(false); setTab("forgot"); }}
                      className="text-[11px] text-muted-foreground hover:text-accent transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="ml-2 h-4 w-4" /></>}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="forgot" className="mt-4">
              {resetSent ? (
                <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-5 text-center space-y-2">
                  <p className="text-sm font-semibold text-foreground">Check your inbox</p>
                  <p className="text-xs text-muted-foreground">
                    A reset link was sent to <strong>{email}</strong>.<br />
                    Click the link in the email to set a new password.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setResetSent(false); setTab("signin"); }}
                    className="mt-2 text-xs text-accent hover:underline"
                  >
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={sendResetEmail} className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Enter your account email and we'll send you a reset link.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full bg-accent hover:bg-accent/90">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send reset link <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setTab("signin")}
                    className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Back to sign in
                  </button>
                </form>
              )}
            </TabsContent>
            <TabsContent value="signup" className="mt-4">
              <form onSubmit={signUp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email2">Email</Label>
                  <Input id="email2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password2">Password</Label>
                  <Input id="password2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                  <p className="text-[11px] text-muted-foreground">Minimum 8 characters.</p>
                </div>
                {inviteToken && (
                  <p className="rounded-md bg-accent-soft px-3 py-2 text-xs text-accent">
                    Invite token detected — your role and workspace will be set automatically.
                  </p>
                )}
                <Button type="submit" disabled={busy} className="w-full bg-accent hover:bg-accent/90">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create account <ArrowRight className="ml-2 h-4 w-4" /></>}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function destinationFor(role: string) {
  if (role === "supplier") return "/supplier/portal";
  return "/dashboard";
}
