## Goal

Replace Firebase entirely with Lovable Cloud (Supabase). Add email/password + Google login, a coordinator role enforced by RLS, gate `/admin` to coordinators, and switch `/screen` and `/mobile` to live Supabase Realtime updates.

## Database (single migration)

Tables in `public`:

- `program_items`
  - `id uuid pk default gen_random_uuid()`
  - `program_id text not null default 'default'`
  - `title text not null`
  - `duration int not null default 0`
  - `status text not null default 'upcoming'` (check: upcoming|live|completed)
  - `item_type text not null default 'announcement'` (check: announcement|speaker|song)
  - `content jsonb not null default '{}'::jsonb`
  - `order_index int not null`
  - `created_at`, `updated_at` timestamps + update trigger
- `app_role` enum: `coordinator`, `attendee`
- `user_roles (user_id uuid → auth.users, role app_role)` with unique `(user_id, role)`
- Security-definer `public.has_role(_user_id uuid, _role app_role)` to avoid RLS recursion

GRANTs + RLS:

- `program_items`: `GRANT SELECT to anon, authenticated` (program is publicly viewable on /screen + /mobile). `GRANT INSERT/UPDATE/DELETE to authenticated`. `GRANT ALL to service_role`.
  - Policies: SELECT `using (true)`; INSERT/UPDATE/DELETE `using (has_role(auth.uid(), 'coordinator'))`.
- `user_roles`: `GRANT SELECT to authenticated`, `GRANT ALL to service_role`. Policies: users can SELECT their own row; only service_role writes (no public insert).
- Enable Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.program_items;` and `ALTER TABLE public.program_items REPLICA IDENTITY FULL;`

First-coordinator bootstrap: after sign-up the user can claim the coordinator role only if no coordinator exists yet. Implemented as a SECURITY DEFINER function `public.claim_coordinator_if_first()` that inserts `(auth.uid(), 'coordinator')` only when the `user_roles` table has zero coordinator rows. Called from a "Become coordinator" button on the auth screen when the signed-in user has no role yet.

## Auth setup

- Enable email/password (no auto-confirm) and Google via `configure_social_auth`.
- New public route `src/routes/auth.tsx`: tabs for Sign In / Sign Up (email+password) and a "Continue with Google" button using `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`. After auth, redirect to `search.redirect` or `/`.
- Reset password flow is out of scope for this change (can be added later).

## Route gating

- Move admin to `src/routes/_authenticated/admin.tsx` (auth gate handled by managed `_authenticated/route.tsx`).
- Inside the admin component, additionally check `has_role` via a server fn `getMyRole`; if not coordinator, render an "Access restricted — coordinator only" screen with a sign-out button. RLS already blocks writes, so this is the UX guard.
- Delete old `src/routes/admin.tsx`.
- Register `attachSupabaseAuth` in `src/start.ts` `functionMiddleware`.

## Data layer rewrite (`src/lib/programs.ts`)

Replace Firestore implementation with Supabase:

- `subscribeItems(cb, programId='default')`: initial `select * order by order_index`, then `supabase.channel('program_items').on('postgres_changes', { event:'*', schema:'public', table:'program_items', filter:\`program_id=eq.${programId}\` }, ...)`. Apply INSERT/UPDATE/DELETE to local state, re-sort, call `cb`. Return cleanup that calls `supabase.removeChannel`.
- `addItem`, `addItemsBulk`: compute next `order_index` from a single `select order_index order desc limit 1`, then insert (bulk uses array insert).
- `goLive(id)`: two updates — set previous live rows to `completed`, set the target to `live`. (RLS allows because caller is coordinator.)
- Keep the same exported types so `mobile.tsx`, `screen.tsx`, `admin.tsx` compile unchanged aside from field renames. Map `order_index → orderIndex` and `item_type → itemType` in the data-access layer so UI keeps its current shape.

## Realtime in /screen and /mobile

No code change needed beyond the new `subscribeItems`: both pages already call it on mount and re-render on updates. Remove `useAnonymousAuth()` calls in both — Supabase reads use the anon publishable key and don't need a session.

## Server function

`src/lib/auth.functions.ts` — `getMyRole` using `requireSupabaseAuth`, returns `{ role: 'coordinator' | 'attendee' | null }` by querying `user_roles` for `context.userId`. Used by admin route to render the gate.

`src/lib/auth.functions.ts` also exports `claimCoordinatorIfFirst` (calls the SECURITY DEFINER RPC) for the bootstrap button.

## Firebase removal

Delete:
- `src/lib/firebase.ts`
- `src/hooks/useAnonymousAuth.ts` (and its `useAnonymousAuth()` call in `__root.tsx` and `admin.tsx`)
- `firebase` from `package.json` (`bun remove firebase`)
- Stale `VITE_FIREBASE_*` env references — none needed.

## Files touched

- New: migration; `src/lib/auth.functions.ts`; `src/routes/auth.tsx`; `src/routes/_authenticated/admin.tsx`
- Rewritten: `src/lib/programs.ts`; `src/routes/screen.tsx` and `src/routes/mobile.tsx` (drop anon auth import); `src/routes/__root.tsx` (drop anon auth); `src/start.ts` (append `attachSupabaseAuth`)
- Deleted: `src/routes/admin.tsx`; `src/lib/firebase.ts`; `src/hooks/useAnonymousAuth.ts`

## Out of scope

- Password reset page.
- Migrating existing Firestore data (project is freshly remixed; starting empty in Supabase).
- An admin UI for granting the coordinator role to additional users (the first-coordinator bootstrap covers initial setup; later coordinators can be added via the Cloud dashboard).
