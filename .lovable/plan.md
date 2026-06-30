## Goal

Three feature areas:
1. **/mobile** — add a real-time **Announcements feed** alongside the existing live/up-next view.
2. **/screen** — coordinator-driven manual playback (next/previous + countdown timer; controls live in /admin only).
3. **/admin** — full program editor: multiple programs, drag-and-drop reordering, inline edit, delete/duplicate, plus playback controls.

## Database (one migration)

- New table `public.programs`: `id uuid pk`, `name text not null`, `is_active boolean not null default false`, `created_at`, `updated_at`. Trigger to keep only one `is_active=true` row at a time. Seed one row `('default-… uuid', 'Main Program', true)` and backfill `program_items.program_id` to its uuid.
- Change `program_items.program_id` from `text default 'default'` to `uuid references public.programs(id) on delete cascade`. Add index on `(program_id, order_index)`.
- GRANTs + RLS on `programs`:
  - `SELECT` to anon + authenticated (public reads the active program).
  - `INSERT/UPDATE/DELETE` to authenticated, gated by `has_role(auth.uid(), 'coordinator')`.
- Enable Realtime on `programs` (publication + `REPLICA IDENTITY FULL`).

`program_items` policies and Realtime remain as today; only the column type changes.

## Data layer (`src/lib/programs.ts`)

- Add `Program` type and helpers:
  - `subscribePrograms(cb)` — Realtime on `programs`, returns list sorted by `created_at`.
  - `getActiveProgram()`, `setActiveProgram(id)` (RPC or two-step update wrapped in a SECURITY DEFINER function `set_active_program(_id uuid)` to atomically flip the flag).
  - `createProgram(name)`, `renameProgram(id, name)`, `deleteProgram(id)`.
- Update existing helpers to take `programId: string` (uuid) — no more `'default'` literal.
- New mutations:
  - `updateItem(id, patch)` — title, duration, itemType, content.
  - `deleteItem(id)`.
  - `duplicateItem(id)` — fetch row, insert copy with next `order_index`, status `upcoming`.
  - `reorderItems(programId, orderedIds[])` — single bulk `upsert` updating `order_index` for affected rows.
  - `goToNext(programId)` / `goToPrevious(programId)` — find current `live`, mark it `completed` (next) or `upcoming` (previous), then promote neighbor by `order_index`. Implemented as a SECURITY DEFINER RPC `advance_program(_program_id uuid, _direction text)` so it's one round-trip and atomic.
  - `clearLive(programId)` — return to standby.

## /mobile — Announcements feed

Add a second section below "Up Next" titled **Announcements**: all `item_type='announcement'` items for the active program, newest `created_at` first, regardless of status. Card shows title + body + relative timestamp. Live updates via the existing `subscribeItems` channel (filter client-side). No new subscription needed.

Subscribe to active program via `subscribePrograms` to follow program switches automatically (re-subscribe items when active changes).

## /screen — Manual playback display

No on-screen controls (per user choice). Add a **countdown timer** to the live card:
- When an item becomes `live`, capture `started_at = now()` in a new column `program_items.live_started_at timestamptz` (set by the `advance_program` RPC and by `goLive`).
- /screen computes `remaining = duration*60 - (now - live_started_at)`, ticks every second client-side, displays `MM:SS`. When ≤0, shows `00:00` in destructive color but does NOT auto-advance.
- Subscribe to active program; if it changes, swap in the new program's items.

## /admin — Editor + controls

Coordinator view restructured into three stacked panels:

1. **Program selector**
   - Dropdown of programs + "New program" inline input + rename/delete buttons for the selected program.
   - "Set as active" toggle (the one shown on /screen and /mobile).

2. **Playback controls** (sticky bar)
   - Shows current live item title + live countdown mirror.
   - Buttons: **Previous**, **Next**, **Pause/Clear live**, **Restart timer**. All call the RPCs above and surface errors inline.

3. **Item editor list**
   - Each row uses **@dnd-kit/sortable** for drag-and-drop reordering (install `@dnd-kit/core` + `@dnd-kit/sortable`). On drop, call `reorderItems`.
   - Row has: drag handle, order #, title, type badge, duration, status, and actions: **Edit**, **Duplicate**, **Delete**, **Go Live**.
   - "Edit" expands the row inline into the same field set already used by the Add form (title/duration/type + type-specific content), with Save/Cancel.
   - Existing **Add item** form and **AI Smart Import** stay above the list and target the selected program.

## Files

- New migration (programs table + RPCs + `live_started_at` column + Realtime).
- Rewritten: `src/lib/programs.ts` (multi-program API + new mutations + RPC wrappers).
- Rewritten: `src/routes/_authenticated/admin.tsx` (program selector, controls, editor list).
- Edited: `src/routes/mobile.tsx` (announcements section + follow active program).
- Edited: `src/routes/screen.tsx` (countdown timer + follow active program).
- New: `src/components/admin/SortableItemRow.tsx`, `src/components/admin/ProgramSwitcher.tsx`, `src/components/admin/PlaybackControls.tsx`, `src/components/admin/EditItemForm.tsx` (to keep `admin.tsx` manageable).
- `package.json`: add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

## Out of scope

- Per-attendee interactions (reactions, Q&A).
- On-screen hover controls at /screen.
- Auto-advance on timer expiry (manual only, per choice).
- Exporting / importing programs as JSON.

## Open assumptions

- "Active program" is global (one shared show at a time). If you ever want concurrent independent shows, /screen and /mobile would need a `?program=<id>` query param — easy to add later.
- Deleting a program cascades its items (matches drag-editor expectations).
