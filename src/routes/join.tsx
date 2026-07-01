import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { joinProgramByCode } from "@/lib/programs.functions";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Join Event — Live Program" },
      { name: "description", content: "Enter a program code to follow along." },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const navigate = useNavigate();
  const joinByCode = useServerFn(joinProgramByCode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setBusy(true);
    setError(null);
    try {
      await joinByCode({ data: { code: normalized } });
      navigate({ to: "/mobile", search: { code: normalized } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to join program.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const needsSignIn =
    error?.toLowerCase().includes("unauthorized") ||
    error?.toLowerCase().includes("not authenticated");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Join event
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            Enter the room code
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Use the code shown on the audience screen to open the right program on your phone.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="w-full rounded-2xl border border-input bg-background px-4 py-4 text-center font-mono text-2xl font-semibold uppercase tracking-[0.28em] outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={!code.trim() || busy}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Joining..." : "Open program"}
            </button>
            {error && (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {needsSignIn && (
              <Link
                to="/auth"
                search={{ redirect: "/join" }}
                className="block rounded-xl border border-border bg-card px-4 py-3 text-center text-sm font-medium"
              >
                Sign in to join
              </Link>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
