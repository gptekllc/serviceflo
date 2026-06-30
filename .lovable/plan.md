## Goal

A dedicated **Announcements composer** at the top of /admin that lets a coordinator publish a short announcement in two clicks. Posts appear instantly in the /mobile **Announcements** feed via the existing Realtime subscription.

## Approach

Reuse the existing `program_items` model (`item_type = 'announcement'`) — that's what the /mobile feed already reads, so new posts show up with no data-layer changes. The composer is a streamlined UI separate from the generic "Add item" form: title + body only, with an optional "Pin to screen" action that also marks it live.

## /admin changes

New `AnnouncementsComposer` component, rendered above `PlaybackControls`:

- **Inputs**: title (required, ≤120 chars) and body (≤1000 chars), validated with zod.
- **Targets the active program** (not the currently-selected one) so posts always reach the audience on /mobile — show a small note if no program is active and disable the form.
- **Publish** button → calls `addItem({ itemType: 'announcement', duration: 0, ... }, activeProgramId)`. Resets the form, focuses the title field.
- **Publish & show on screen** secondary button → same as Publish, then calls `goLive(newItemId, activeProgramId)` so it appears on /screen immediately.
- **Recent announcements strip**: last 3 announcements for the active program, with a one-click "Delete" affordance. Subscribed via the existing items subscription, filtered client-side.
- Loading + inline error states; no toasts.

No new server functions, no migration. zod is already a dependency.

## Files touched

- New: `src/components/admin/AnnouncementsComposer.tsx`
- Edited: `src/routes/_authenticated/admin.tsx` — render the composer; expose the active program from the programs subscription (currently the admin only tracks `selectedId`, so add a derived `active` and pass it in).
- Edited: `src/lib/programs.ts` — small tweak: have `addItem` return the newly created row's id so the composer can call `goLive` on it.

## Out of scope

- A separate announcements table or schema change.
- Scheduling future announcements.
- Push notifications.
- Reactions or read receipts.