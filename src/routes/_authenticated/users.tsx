import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import {
  createUserByAdmin,
  listManagedUsersByAdmin,
  resetUserPasswordByAdmin,
  setUserDeactivatedByAdmin,
  updateUserRoleByAdmin,
  type AdminManagedUser,
} from "@/lib/admin.functions";
import { ensureMyCoordinatorRole, getMyRole, type AppRole } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users — Admin Settings" },
      { name: "description", content: "Manage users, roles, and access." },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const navigate = useNavigate();
  const fetchMyRole = useServerFn(getMyRole);
  const ensureCoordinatorRole = useServerFn(ensureMyCoordinatorRole);

  const [role, setRole] = useState<AppRole | null | "loading">("loading");

  const loadRole = async () => {
    try {
      const { role } = await fetchMyRole();
      setRole(role);
    } catch (e) {
      console.error(e);
      setRole(null);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        await ensureCoordinatorRole();
        await loadRole();
      } catch (e) {
        console.error(e);
        setRole(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const handleAdminSignIn = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: "/users" }, replace: true });
  };

  if (role === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (role !== "coordinator") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Admin sign-in required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with an admin account to manage users.
          </p>
          <div className="mt-6 space-y-3">
            <button
              onClick={handleAdminSignIn}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Sign in as admin
            </button>
            <button
              onClick={handleSignOut}
              className="w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">User Management</h1>
          <div className="flex items-center gap-4">
            <Link
              to="/admin"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Back to admin
            </Link>
            <button
              onClick={handleSignOut}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>

        <AdminSettings />
      </div>
    </div>
  );
}

function AdminSettings() {
  const createUser = useServerFn(createUserByAdmin);
  const listUsers = useServerFn(listManagedUsersByAdmin);
  const updateUserRole = useServerFn(updateUserRoleByAdmin);
  const setUserDeactivated = useServerFn(setUserDeactivatedByAdmin);
  const resetUserPassword = useServerFn(resetUserPasswordByAdmin);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("attendee");
  const [emailConfirmed, setEmailConfirmed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [usersLoading, setUsersLoading] = useState(true);
  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [actionBusyUserId, setActionBusyUserId] = useState<string | null>(null);
  const [roleDraftByUserId, setRoleDraftByUserId] = useState<Record<string, AppRole>>({});
  const [passwordDraftByUserId, setPasswordDraftByUserId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refreshUsers = async () => {
    setUsersLoading(true);
    try {
      const { users } = await listUsers();
      setUsers(users);
      setRoleDraftByUserId((prev) => {
        const next: Record<string, AppRole> = {};
        for (const user of users) {
          next[user.id] = prev[user.id] ?? user.role ?? "attendee";
        }
        return next;
      });
      setPasswordDraftByUserId((prev) => {
        const next: Record<string, string> = {};
        for (const user of users) {
          next[user.id] = prev[user.id] ?? "";
        }
        return next;
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    void refreshUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await createUser({
        data: {
          email: email.trim(),
          password,
          role,
          emailConfirmed,
        },
      });
      setSuccess(`User ${email.trim()} created with role ${role}.`);
      setEmail("");
      setPassword("");
      setRole("attendee");
      setEmailConfirmed(true);
      await refreshUsers();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runUserAction = async (userId: string, fn: () => Promise<void>, okMessage: string) => {
    setActionBusyUserId(userId);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      setSuccess(okMessage);
      await refreshUsers();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionBusyUserId(null);
    }
  };

  const handleRoleUpdate = async (user: AdminManagedUser) => {
    const draftRole = roleDraftByUserId[user.id] ?? "attendee";
    await runUserAction(
      user.id,
      async () => {
        await updateUserRole({ data: { userId: user.id, role: draftRole } });
      },
      `Updated ${user.email} to ${draftRole}.`,
    );
  };

  const handleToggleDeactivated = async (user: AdminManagedUser) => {
    const nextState = !user.isDeactivated;
    await runUserAction(
      user.id,
      async () => {
        await setUserDeactivated({ data: { userId: user.id, deactivated: nextState } });
      },
      `${nextState ? "Deactivated" : "Reactivated"} ${user.email}.`,
    );
  };

  const handleResetPassword = async (user: AdminManagedUser) => {
    const draftPassword = passwordDraftByUserId[user.id] ?? "";
    if (draftPassword.length < 8) {
      setError("Temporary password must be at least 8 characters.");
      return;
    }
    await runUserAction(
      user.id,
      async () => {
        await resetUserPassword({ data: { userId: user.id, password: draftPassword } });
        setPasswordDraftByUserId((prev) => ({ ...prev, [user.id]: "" }));
      },
      `Password reset for ${user.email}.`,
    );
  };

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        Admin settings
      </div>
      <h2 className="mt-2 text-lg font-semibold tracking-tight">Add user</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a new account and assign an initial role.
      </p>

      <form onSubmit={handleCreateUser} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground sm:col-span-2">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label className="text-xs font-medium text-muted-foreground">
          Temporary password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label className="text-xs font-medium text-muted-foreground">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="attendee">attendee</option>
            <option value="coordinator">coordinator</option>
          </select>
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
          <input
            type="checkbox"
            checked={emailConfirmed}
            onChange={(e) => setEmailConfirmed(e.target.checked)}
            className="size-4 rounded border-input"
          />
          Mark email as confirmed (skip email confirmation)
        </label>

        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:col-span-2 sm:w-fit"
        >
          {busy ? "Creating..." : "Create user"}
        </button>
      </form>

      <div className="mt-6 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Existing users
          </h3>
          <button
            type="button"
            onClick={() => void refreshUsers()}
            disabled={usersLoading}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {usersLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {usersLoading ? (
          <div className="mt-3 text-sm text-muted-foreground">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
            No users found.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2 py-2">Last sign-in</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Reset password</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const rowBusy = actionBusyUserId === user.id;
                  return (
                    <tr key={user.id} className="border-b border-border/70 align-top">
                      <td className="px-2 py-3">
                        <div className="font-medium">{user.email}</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          {user.id}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">
                        {formatDateTime(user.createdAt)}
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">
                        {formatDateTime(user.lastSignInAt)}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={roleDraftByUserId[user.id] ?? "attendee"}
                            onChange={(e) =>
                              setRoleDraftByUserId((prev) => ({
                                ...prev,
                                [user.id]: e.target.value as AppRole,
                              }))
                            }
                            disabled={rowBusy}
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                          >
                            <option value="attendee">attendee</option>
                            <option value="coordinator">coordinator</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => void handleRoleUpdate(user)}
                            disabled={rowBusy}
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              user.isDeactivated
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            }`}
                          >
                            {user.isDeactivated ? "deactivated" : "active"}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleToggleDeactivated(user)}
                            disabled={rowBusy}
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                          >
                            {user.isDeactivated ? "Reactivate" : "Deactivate"}
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="password"
                            minLength={8}
                            value={passwordDraftByUserId[user.id] ?? ""}
                            onChange={(e) =>
                              setPasswordDraftByUserId((prev) => ({
                                ...prev,
                                [user.id]: e.target.value,
                              }))
                            }
                            disabled={rowBusy}
                            placeholder="new password"
                            className="w-40 rounded-md border border-input bg-background px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => void handleResetPassword(user)}
                            disabled={rowBusy}
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                          >
                            Set password
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {success}
        </div>
      )}
    </section>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
