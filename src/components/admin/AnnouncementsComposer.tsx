import { useMemo, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  addItem,
  deleteItem,
  goLive,
  updateItem,
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

function toDateTimeLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function parsePublishAt(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid publish time");
  }
  return parsed.toISOString();
}

function isScheduled(item: ProgramItem): boolean {
  return !!item.publishedAt && new Date(item.publishedAt).getTime() > Date.now();
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
  const [publishAt, setPublishAt] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [priority, setPriority] = useState("0");
  const [busy, setBusy] = useState<null | "publish" | "publish-live">(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const recent = useMemo(
    () =>
      items
        .filter((i) => i.itemType === "announcement")
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.createdAt < b.createdAt ? 1 : -1;
        }),
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
      const scheduledFor = parsePublishAt(publishAt);
      const content: AnnouncementContent = { body: parsed.data.body };
      const id = await addItem(
        {
          title: parsed.data.title,
          duration: 0,
          itemType: "announcement",
          content,
          publishedAt: alsoLive ? new Date().toISOString() : scheduledFor,
          isPinned,
          priority: Number(priority) || 0,
        },
        activeProgram.id,
      );
      if (alsoLive) {
        await goLive(id, activeProgram.id);
      }
      setTitle("");
      setBody("");
      setPublishAt("");
      setIsPinned(false);
      setPriority("0");
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
              ? `Posting to "${activeProgram.name}" — visible on /mobile and /screen when published.`
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Publish at
            </label>
            <input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              disabled={disabled || busy !== null}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </div>
          <label className="flex items-end gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              disabled={disabled || busy !== null}
            />
            <span>Pin to top</span>
          </label>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Priority
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              disabled={disabled || busy !== null}
              className="mt-1 w-28 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
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
            Manage announcements
          </div>
          <ul className="mt-2 space-y-2">
            {recent.map((item) => {
              const c = (item.content ?? {}) as Partial<AnnouncementContent>;
              const scheduled = isScheduled(item);
              return (
                <li
                  key={item.id}
                  className="rounded-md border border-border bg-background p-2"
                >
                  {editingId === item.id ? (
                    <AnnouncementEditor
                      item={item}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => setEditingId(null)}
                      onError={setError}
                    />
                  ) : (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <span>{relativeTime(item.createdAt)}</span>
                          {item.isPinned && (
                            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700">
                              pinned
                            </span>
                          )}
                          {item.priority !== 0 && (
                            <span className="rounded-full bg-secondary px-1.5 py-0.5 font-semibold text-secondary-foreground">
                              priority {item.priority}
                            </span>
                          )}
                          {scheduled && item.publishedAt && (
                            <span className="rounded-full bg-accent px-1.5 py-0.5 font-semibold text-accent-foreground">
                              scheduled {toDateTimeLocalInput(item.publishedAt).replace("T", " ")}
                            </span>
                          )}
                          {item.status === "live" && (
                            <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 font-semibold text-destructive">
                              on screen
                            </span>
                          )}
                        </div>
                        <div className="truncate text-sm font-medium">{item.title}</div>
                        {c.body && (
                          <div className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
                            {c.body}
                          </div>
                        )}
                      </div>
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => setEditingId(item.id)}
                          className="rounded-md border border-input bg-background px-2 py-1 text-[11px] hover:bg-accent"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void handleDelete(item.id, item.title)}
                          className="rounded-md border border-destructive/40 bg-background px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function AnnouncementEditor({
  item,
  onCancel,
  onSaved,
  onError,
}: {
  item: ProgramItem;
  onCancel: () => void;
  onSaved: () => void;
  onError: (value: string | null) => void;
}) {
  const c = (item.content ?? {}) as Partial<AnnouncementContent>;
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(c.body ?? "");
  const [publishAt, setPublishAt] = useState(toDateTimeLocalInput(item.publishedAt));
  const [isPinned, setIsPinned] = useState(item.isPinned);
  const [priority, setPriority] = useState(String(item.priority));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const parsed = schema.safeParse({ title, body });
    if (!parsed.success) {
      onError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await updateItem(item.id, {
        title: parsed.data.title,
        content: { body: parsed.data.body },
        publishedAt: parsePublishAt(publishAt),
        isPinned,
        priority: Number(priority) || 0,
      });
      onSaved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        disabled={busy}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={1000}
        disabled={busy}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="datetime-local"
          value={publishAt}
          onChange={(e) => setPublishAt(e.target.value)}
          disabled={busy}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <label className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
            disabled={busy}
          />
          <span>Pin to top</span>
        </label>
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          disabled={busy}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          onClick={() => void save()}
          disabled={busy}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
