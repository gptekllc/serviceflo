## Phase 4: AI Smart Import

### Approach

Use the built-in **Lovable AI Gateway** (default model `google/gemini-3-flash-preview`, fast + free of API-key setup) called through a TanStack `createServerFn` so the key stays server-side. The "frontend service function" you described becomes a thin client wrapper around that server fn — same DX, no exposed key. (If you'd rather call OpenAI/Gemini directly from the browser with a pasted key, say so and I'll swap step 2 for that instead.)

### Files

**`src/lib/ai-gateway.server.ts`** — Lovable AI Gateway provider helper (per the gateway knowledge file). Server-only.

**`src/lib/ai-import.functions.ts`** — `parseBulletin` server function:
- `createServerFn({ method: "POST" })`
- `inputValidator` with Zod: `{ text: string (1..20000) }`
- Reads `process.env.LOVABLE_API_KEY` inside handler; throws clear error if missing.
- Calls `generateText` with `Output.object({ schema })` where schema is:
  ```
  { items: Array<{
      title: string,
      duration: number,           // minutes, default 5 if unknown
      itemType: 'announcement' | 'speaker' | 'song',
      content:
        | { body: string }                                     // announcement
        | { speaker: string, topic: string, bio: string }      // speaker
        | { lyrics: string }                                   // song
    }> }
  ```
- System prompt instructs strict chronological parsing, exact widget-type mapping, missing fields → empty strings, durations as integers, no extra commentary.
- Returns `{ items: ParsedItem[] }`.

**`src/lib/programs.ts`** — add `addItemsBulk(items, programId?)`:
- Read current max `orderIndex` once.
- Write each new item via `writeBatch`, incrementing `orderIndex` from `max+1`.
- Status defaults to `"upcoming"`.

**`src/routes/admin.tsx`** — add the "AI Smart Import" section above the manual form:
- Collapsible panel with header "AI Smart Import" and a sparkle/wand icon.
- Large `<textarea>` (8 rows) for pasted bulletin text.
- "Import with AI" button — disabled while empty or running.
- Loading state: spinner + "Reading your bulletin…" overlay on the panel; button shows spinner.
- On success: shows a small preview list of the parsed items (title + type chip), an "Add all to program" button, and an "Edit raw text" link to retry. Clicking "Add all" calls `addItemsBulk` and the realtime listener instantly renders them in the list below.
- On error: shows the error message inline (covers 429 rate-limited and 402 credit-exhausted with friendly copy).

### Loading + UX details

- Spinner is a Tailwind-only `animate-spin` SVG using `currentColor` (no new deps).
- The textarea stays editable during loading-failed states so the user can tweak and retry.
- After successful import, the textarea clears and the panel collapses.

### Out of scope

- Editing parsed items before insert (only "Add all" or discard for now).
- Streaming the AI response — the JSON output isn't useful partial.
- Persisting drafts across reloads.

### Technical notes

- Server fn keeps `LOVABLE_API_KEY` off the client.
- Discriminated-union content shape is enforced both in the Zod schema sent to the model and in the client-side `addItemsBulk` writer; malformed items are skipped with a console warning rather than failing the whole batch.
- `addItemsBulk` uses a single `writeBatch`, so all items appear at once via the existing `onSnapshot` listener — no extra wiring.
