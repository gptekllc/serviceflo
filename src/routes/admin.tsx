import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import {
  subscribeItems,
  addItem,
  addItemsBulk,
  goLive,
  type ItemContent,
  type ItemType,
  type ProgramItem,
} from "../lib/programs";
import { parseBulletin, type ParsedItem } from "../lib/ai-import.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Live Program" },
      { name: "description", content: "Event coordinator dashboard." },
    ],
  }),
  component: AdminPage,
});

const TYPE_LABEL: Record<ItemType, string> = {
  announcement: "Announcement",
  speaker: "Speaker",
  song: "Song",
};

function AdminPage() {
  const { user, loading } = useAnonymousAuth();
  const [items, setItems] = useState<ProgramItem[]>([]);
  const [itemType, setItemType] = useState<ItemType>("announcement");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("5");
  const [body, setBody] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [topic, setTopic] = useState("");
  const [bio, setBio] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => subscribeItems(setItems), []);

  const resetForm = () => {
    setTitle("");
    setDuration("5");
    setBody("");
    setSpeaker("");
    setTopic("");
    setBio("");
    setLyrics("");
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setErr(null);
    setBusy("add");
    try {
      let content: ItemContent;
      if (itemType === "announcement") {
        content = { body: body.trim() };
      } else if (itemType === "speaker") {
        content = { speaker: speaker.trim(), topic: topic.trim(), bio: bio.trim() };
      } else {
        content = { lyrics: lyrics.trim() };
      }
      await addItem({
        title: title.trim(),
        duration: Number(duration) || 0,
        itemType,
        content,
      });
      resetForm();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleGoLive = async (id: string) => {
    setErr(null);
    setBusy(id);
    try {
      await goLive(id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            Event Coordinator
          </h1>
          <div className="text-xs text-muted-foreground">
            {loading ? "…" : user ? `UID ${user.uid.slice(0, 6)}` : "offline"}
          </div>
        </div>

        <SmartImport />



        <form
          onSubmit={handleAdd}
          className="mt-6 space-y-4 rounded-lg border border-border p-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_120px]">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Welcome & Worship"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Widget type
              </label>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value as ItemType)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="announcement">Announcement</option>
                <option value="speaker">Speaker</option>
                <option value="song">Song</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Duration (min)
              </label>
              <input
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {itemType === "announcement" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Body
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder="Announcement details…"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {itemType === "speaker" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Speaker name
                </label>
                <input
                  value={speaker}
                  onChange={(e) => setSpeaker(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Topic
                </label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          )}

          {itemType === "song" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Lyrics
              </label>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                rows={6}
                placeholder={"Verse 1…\nChorus…"}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy === "add" || !title.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {busy === "add" ? "Adding…" : "Add item"}
            </button>
          </div>
        </form>

        {err && (
          <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err}
          </div>
        )}

        <div className="mt-8 space-y-2">
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No items yet. Add the first one above.
            </div>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border p-3"
            >
              <div className="w-6 text-center text-sm tabular-nums text-muted-foreground">
                {item.orderIndex + 1}
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">{item.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground">
                    {TYPE_LABEL[item.itemType ?? "announcement"]}
                  </span>
                  <span>{item.duration} min</span>
                  <StatusBadge status={item.status} />
                </div>
              </div>
              <button
                onClick={() => handleGoLive(item.id)}
                disabled={busy === item.id || item.status === "live"}
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {item.status === "live"
                  ? "Live"
                  : busy === item.id
                    ? "…"
                    : "Go Live"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ProgramItem["status"] }) {
  const styles =
    status === "live"
      ? "bg-destructive/15 text-destructive"
      : status === "completed"
        ? "bg-muted text-muted-foreground"
        : "bg-accent text-accent-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles}`}>
      {status}
    </span>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SmartImport() {
  const parse = useServerFn(parseBulletin);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedItem[] | null>(null);

  const handleParse = async () => {
    if (!text.trim()) return;
    setError(null);
    setPreview(null);
    setLoading(true);
    try {
      const result = await parse({ data: { text: text.trim() } });
      if (!result.items.length) {
        setError("The AI didn't find any items in that text. Try adding more detail.");
      } else {
        setPreview(result.items);
      }
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddAll = async () => {
    if (!preview) return;
    setSaving(true);
    setError(null);
    try {
      const sanitized = preview
        .filter((p) => p.title?.trim() && p.itemType)
        .map((p) => {
          let content: ItemContent;
          if (p.itemType === "speaker") {
            content = {
              speaker: p.content.speaker ?? "",
              topic: p.content.topic ?? "",
              bio: p.content.bio ?? "",
            };
          } else if (p.itemType === "song") {
            content = { lyrics: p.content.lyrics ?? "" };
          } else {
            content = { body: p.content.body ?? "" };
          }
          return {
            title: p.title.trim(),
            duration: Math.max(0, Math.round(p.duration ?? 0)),
            itemType: p.itemType,
            content,
          };
        });
      await addItemsBulk(sanitized);
      setText("");
      setPreview(null);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message || "Failed to save items.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 bg-secondary/40 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
      >
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2l1.8 4.6L18 8l-4.2 1.4L12 14l-1.8-4.6L6 8l4.2-1.4L12 2zm6 10l1 2.5L21 15l-2 .5L18 18l-1-2.5L15 15l2-.5L18 12zM5 14l.9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9L5 14z" />
            </svg>
          </span>
          <div>
            <div className="text-sm font-semibold">AI Smart Import</div>
            <div className="text-xs text-muted-foreground">
              Paste a bulletin and let AI structure it.
            </div>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="relative space-y-3 border-t border-border p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={
              "Paste your bulletin or schedule here…\n\ne.g.\n9:00 Welcome & Announcements\n9:10 Opening Song — Amazing Grace\n9:20 Sermon — Pastor Lee on 'Hope'\n…"
            }
            disabled={loading || saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {preview && preview.length > 0 && (
            <div className="rounded-md border border-border bg-card">
              <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Preview · {preview.length} item{preview.length === 1 ? "" : "s"}
              </div>
              <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                {preview.map((p, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-6 text-center text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate">{p.title}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground">
                      {TYPE_LABEL[p.itemType]}
                    </span>
                    <span className="text-xs text-muted-foreground">{p.duration}m</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {preview ? (
              <>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  disabled={saving}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                  Edit text
                </button>
                <button
                  type="button"
                  onClick={handleAddAll}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving && <Spinner />}
                  {saving ? "Adding…" : `Add all to program`}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleParse}
                disabled={loading || !text.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading && <Spinner />}
                {loading ? "Reading your bulletin…" : "Import with AI"}
              </button>
            )}
          </div>

          {loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/60 backdrop-blur-sm">
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-sm">
                <Spinner />
                Reading your bulletin…
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
