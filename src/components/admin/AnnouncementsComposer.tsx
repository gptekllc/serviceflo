import { useMemo, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  addItem,
  deleteItem,
  goLive,
  type AnnouncementContent,
  type Program,
  type ProgramItem,
} from "@/lib/programs";

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(120, "Title must be 120 characters or fewer"),
  body: z
    .string()
    .trim()
    .max(1000, "Body must be 1000 characters or fewer"),
});

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function AnnouncementsComposer({
  activeProgram,
  items,
}: {
  activeProgram: Program | null;
  items: ProgramItem[];
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<null | "publish" | "publish-live">(null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const recent = useMemo(
    () =>
      items
        .filter((i) => i.itemType === "announcement")
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 3),
    [items],
  );

  const disabled = !activeProgram;

  const publish = async (alsoLive: boolean, e?: FormEvent) => {
    e?.preventDefault();
    if (!activeProgram) return;
    const parsed = schema.safeParse({ title, body });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setError(null);
    setBusy(alsoLive ? "publish-live" : "publish");
    try {
      const content: AnnouncementContent = { body: parsed.data.body };
      const id = await addItem(
        {
          title: parsed.data.title,
          duration: 0,
          itemType: "announcement",
          content,
        },
        activeProgram.id,
      );
      if (alsoLive) {
        await goLive(id, activeProgram.id);
      }
      setTitle("");
      setBody("");
      titleRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete announcement "${name}"?`)) return;
    setError(null);
    try {
      await deleteItem(id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Announcements
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {activeProgram
              ? `Posting to "${activeProgram.name}" — visible on /mobile instantly.`
              : "Set a program as active to post announcements."}
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => void publish(false, e)}
        className="mt-3 space-y-3"
        aria-disabled={disabled}
      >
        <div>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Title (e.g. Lunch in 10 minutes)"
            disabled={disabled || busy !== null}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </div>
        <div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Optional details…"
            disabled={disabled || busy !== null}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
          <div className="mt-1 flex justify-end text-[10px] tabular-nums text-muted-foreground">
            {body.length}/1000
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => void publish(true)}
            disabled={disabled || busy !== null || !title.trim()}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {busy === "publish-live" ? "Publishing…" : "Publish & show on screen"}
          </button>
          <button
            type="submit"
            disabled={disabled || busy !== null || !title.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </form>

      {recent.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Recent
          </div>
          <ul className="mt-2 space-y-2">
            {recent.map((item) => {
              const c = (item.content ?? {}) as Partial<AnnouncementContent>;
              return (
                <li
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-border bg-background p-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span>{relativeTime(item.createdAt)}</span>
                      {item.status === "live" && (
                        <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 font-semibold text-destructive">
                          on screen
                        </span>
                      )}
                    </div>
                    <div className="truncate text-sm font-medium">{item.title}</div>
                    {c.body && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {c.body}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => void handleDelete(item.id, item.title)}
                    className="self-start rounded-md border border-destructive/40 bg-background px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
