import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  addItem,
  addItemsBulk,
  advanceProgram,
  clearLive,
  createProgram,
  deleteItem,
  deleteProgram,
  duplicateItem,
  goLive,
  renameProgram,
  reorderItems,
  setActiveProgram,
  subscribeItems,
  subscribePrograms,
  updateItem,
  type AnnouncementContent,
  type ItemContent,
  type ItemType,
  type Program,
  type ProgramItem,
  type SongContent,
  type SpeakerContent,
} from "@/lib/programs";
import { parseBulletin, type ParsedItem } from "@/lib/ai-import.functions";
import {
  getMyRole,
  claimCoordinatorIfFirst,
  type AppRole,
} from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";
import { AnnouncementsComposer } from "@/components/admin/AnnouncementsComposer";

export const Route = createFileRoute("/_authenticated/admin")({
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
  const navigate = useNavigate();
  const fetchMyRole = useServerFn(getMyRole);
  const claimCoordinator = useServerFn(claimCoordinatorIfFirst);

  const [role, setRole] = useState<AppRole | null | "loading">("loading");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

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
        const { role } = await fetchMyRole();
        if (role) {
          setRole(role);
          return;
        }
        // Auto-promote: first signed-in user becomes the coordinator (super admin)
        try {
          await claimCoordinator();
        } catch {
          // ignore — another user may have claimed concurrently
        }
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

  const handleClaim = async () => {
    setClaiming(true);
    setClaimError(null);
    try {
      const { claimed } = await claimCoordinator();
      if (claimed) {
        await loadRole();
      } else {
        setClaimError("A coordinator already exists. Ask them to grant you access.");
      }
    } catch (e) {
      setClaimError((e as Error).message);
    } finally {
      setClaiming(false);
    }
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Coordinator access required
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Only event coordinators can manage the program.
          </p>
          <div className="mt-6 space-y-3">
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {claiming ? "…" : "Become the first coordinator"}
            </button>
            <button
              onClick={handleSignOut}
              className="w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Sign out
            </button>
          </div>
          {claimError && (
            <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {claimError}
            </div>
          )}
        </div>
      </div>
    );
  }

  return <CoordinatorView onSignOut={handleSignOut} />;
}

function CoordinatorView({ onSignOut }: { onSignOut: () => void }) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<ProgramItem[]>([]);
  const [activeItems, setActiveItems] = useState<ProgramItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => subscribePrograms(setPrograms), []);

  // Default selection: active program, else first
  useEffect(() => {
    if (!selectedId && programs.length > 0) {
      const active = programs.find((p) => p.isActive);
      setSelectedId((active ?? programs[0]).id);
    } else if (selectedId && !programs.some((p) => p.id === selectedId)) {
      setSelectedId(programs[0]?.id ?? null);
    }
  }, [programs, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setItems([]);
      return;
    }
    return subscribeItems(setItems, selectedId);
  }, [selectedId]);

  const active = useMemo(
    () => programs.find((p) => p.isActive) ?? null,
    [programs],
  );

  // Subscribe to active program items only when it differs from selected
  useEffect(() => {
    if (!active || active.id === selectedId) {
      setActiveItems([]);
      return;
    }
    return subscribeItems(setActiveItems, active.id);
  }, [active, selectedId]);

  const composerItems = active && active.id === selectedId ? items : activeItems;

  const selected = useMemo(
    () => programs.find((p) => p.id === selectedId) ?? null,
    [programs, selectedId],
  );

  const runSafe = async (fn: () => Promise<void>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            Event Coordinator
          </h1>
          <button
            onClick={onSignOut}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Sign out
          </button>
        </div>

        <AnnouncementsComposer activeProgram={active} items={composerItems} />

        <ProgramSwitcher
          programs={programs}
          selected={selected}
          onSelect={setSelectedId}
          onError={setErr}
        />


        {selected && (
          <>
            <PlaybackControls
              program={selected}
              items={items}
              onError={setErr}
            />

            <SmartImport programId={selected.id} />

            <AddItemForm
              programId={selected.id}
              onError={setErr}
            />

            {err && (
              <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {err}
              </div>
            )}

            <ItemList
              items={items}
              programId={selected.id}
              onError={setErr}
              runSafe={runSafe}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Program switcher ----------

function ProgramSwitcher({
  programs,
  selected,
  onSelect,
  onError,
}: {
  programs: Program[];
  selected: Program | null;
  onSelect: (id: string) => void;
  onError: (msg: string | null) => void;
}) {
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    onError(null);
    try {
      const p = await createProgram(newName.trim());
      setNewName("");
      onSelect(p.id);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSetActive = async () => {
    if (!selected) return;
    setBusy(true);
    onError(null);
    try {
      await setActiveProgram(selected.id);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!selected || !renameValue.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await renameProgram(selected.id, renameValue.trim());
      setRenaming(false);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}" and all its items?`)) return;
    setBusy(true);
    onError(null);
    try {
      await deleteProgram(selected.id);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-lg border border-border p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Program
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={selected?.id ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="min-w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {programs.length === 0 && <option value="">No programs</option>}
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isActive ? " · live" : ""}
            </option>
          ))}
        </select>
        {selected && !selected.isActive && (
          <button
            onClick={handleSetActive}
            disabled={busy}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Set as active
          </button>
        )}
        {selected && selected.isActive && (
          <span className="rounded-full bg-accent px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
            Active
          </span>
        )}
        {selected && (
          <>
            {renaming ? (
              <span className="flex items-center gap-1">
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  placeholder={selected.name}
                />
                <button
                  onClick={handleRename}
                  disabled={busy}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => setRenaming(false)}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => {
                  setRenameValue(selected.name);
                  setRenaming(true);
                }}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
              >
                Rename
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={busy}
              className="rounded-md border border-destructive/40 bg-background px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Delete
            </button>
          </>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New program name…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
        />
        <button
          onClick={handleCreate}
          disabled={busy || !newName.trim()}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          Create
        </button>
      </div>
    </section>
  );
}

// ---------- Playback controls ----------

function PlaybackControls({
  program,
  items,
  onError,
}: {
  program: Program;
  items: ProgramItem[];
  onError: (msg: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const live = items.find((i) => i.status === "live");

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    onError(null);
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sticky top-2 z-20 mt-6 rounded-lg border border-border bg-card/95 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {live ? "Live" : "Standby"}
          </div>
          <div className="mt-1 truncate text-base font-semibold">
            {live?.title ?? "Nothing on screen"}
          </div>
          {live && <LiveCountdown item={live} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void run(() => advanceProgram(program.id, "previous"))}
            disabled={busy || !live}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
          >
            ← Previous
          </button>
          <button
            onClick={() => void run(() => clearLive(program.id))}
            disabled={busy || !live}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
          >
            Standby
          </button>
          <button
            onClick={() => void run(() => advanceProgram(program.id, "next"))}
            disabled={busy}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>
      {!program.isActive && (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          This program isn't active. Set it as active to display on /screen and /mobile.
        </div>
      )}
    </section>
  );
}

function LiveCountdown({ item }: { item: ProgramItem }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!item.liveStartedAt || item.duration <= 0) {
    return (
      <div className="mt-0.5 text-xs text-muted-foreground">
        {item.duration} min
      </div>
    );
  }
  const startedAt = new Date(item.liveStartedAt).getTime();
  const totalMs = item.duration * 60_000;
  const remainingMs = startedAt + totalMs - now;
  const overrun = remainingMs < 0;
  const ms = Math.abs(remainingMs);
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return (
    <div
      className={`mt-0.5 font-mono text-xs tabular-nums ${overrun ? "text-destructive" : "text-muted-foreground"}`}
    >
      {overrun ? "+" : ""}
      {m}:{s}
    </div>
  );
}

// ---------- Add item ----------

function AddItemForm({
  programId,
  onError,
}: {
  programId: string;
  onError: (msg: string | null) => void;
}) {
  const [itemType, setItemType] = useState<ItemType>("announcement");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("5");
  const [body, setBody] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [topic, setTopic] = useState("");
  const [bio, setBio] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle("");
    setDuration("5");
    setBody("");
    setSpeaker("");
    setTopic("");
    setBio("");
    setLyrics("");
  };

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    onError(null);
    try {
      let content: ItemContent;
      if (itemType === "announcement") content = { body: body.trim() };
      else if (itemType === "speaker")
        content = { speaker: speaker.trim(), topic: topic.trim(), bio: bio.trim() };
      else content = { lyrics: lyrics.trim() };
      await addItem(
        {
          title: title.trim(),
          duration: Number(duration) || 0,
          itemType,
          content,
        },
        programId,
      );
      reset();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handle} className="mt-6 space-y-4 rounded-lg border border-border p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Add item
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_120px]">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Welcome & Worship"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Type</label>
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
          <label className="text-xs font-medium text-muted-foreground">Duration (min)</label>
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
        <Textarea label="Body" value={body} onChange={setBody} rows={3} />
      )}
      {itemType === "speaker" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput label="Speaker name" value={speaker} onChange={setSpeaker} />
          <TextInput label="Topic" value={topic} onChange={setTopic} />
          <div className="sm:col-span-2">
            <Textarea label="Bio" value={bio} onChange={setBio} rows={3} />
          </div>
        </div>
      )}
      {itemType === "song" && (
        <Textarea label="Lyrics" value={lyrics} onChange={setLyrics} rows={6} mono />
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add item"}
        </button>
      </div>
    </form>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  rows,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={`mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

// ---------- Item list with DnD ----------

function ItemList({
  items,
  programId,
  onError,
  runSafe,
}: {
  items: ProgramItem[];
  programId: string;
  onError: (msg: string | null) => void;
  runSafe: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const orderedIds = localOrder ?? items.map((i) => i.id);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean) as ProgramItem[];

  // Reset local override when realtime confirms.
  useEffect(() => {
    if (!localOrder) return;
    const remoteOrder = items.map((i) => i.id);
    if (
      remoteOrder.length === localOrder.length &&
      remoteOrder.every((id, i) => id === localOrder[i])
    ) {
      setLocalOrder(null);
    }
  }, [items, localOrder]);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedIds.indexOf(active.id as string);
    const newIdx = orderedIds.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(orderedIds, oldIdx, newIdx);
    setLocalOrder(next);
    try {
      await reorderItems(next);
    } catch (err) {
      onError((err as Error).message);
      setLocalOrder(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No items yet. Add the first one above.
      </div>
    );
  }

  return (
    <div className="mt-8">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {ordered.map((item, idx) => (
              <SortableRow
                key={item.id}
                item={item}
                index={idx}
                programId={programId}
                runSafe={runSafe}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow({
  item,
  index,
  programId,
  runSafe,
}: {
  item: ProgramItem;
  index: number;
  programId: string;
  runSafe: (fn: () => Promise<void>) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const [editing, setEditing] = useState(false);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-border bg-card"
    >
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 p-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
        <div className="w-6 text-center text-sm tabular-nums text-muted-foreground">
          {index + 1}
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium">{item.title}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground">
              {TYPE_LABEL[item.itemType]}
            </span>
            <span>{item.duration} min</span>
            <StatusBadge status={item.status} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
          >
            {editing ? "Close" : "Edit"}
          </button>
          <button
            onClick={() => void runSafe(() => duplicateItem(item.id, programId))}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
            aria-label="Duplicate"
          >
            Copy
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete "${item.title}"?`))
                void runSafe(() => deleteItem(item.id));
            }}
            className="rounded-md border border-destructive/40 bg-background px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
          >
            Delete
          </button>
          <button
            onClick={() => void runSafe(() => goLive(item.id, programId))}
            disabled={item.status === "live"}
            className="rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-40"
          >
            {item.status === "live" ? "Live" : "Go Live"}
          </button>
        </div>
      </div>
      {editing && (
        <EditItemPanel
          item={item}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
          runSafe={runSafe}
        />
      )}
    </li>
  );
}

function EditItemPanel({
  item,
  onCancel,
  onSaved,
  runSafe,
}: {
  item: ProgramItem;
  onCancel: () => void;
  onSaved: () => void;
  runSafe: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [title, setTitle] = useState(item.title);
  const [duration, setDuration] = useState(String(item.duration));
  const [itemType, setItemType] = useState<ItemType>(item.itemType);
  const c = (item.content ?? {}) as Partial<
    AnnouncementContent & SpeakerContent & SongContent
  >;
  const [body, setBody] = useState(c.body ?? "");
  const [speaker, setSpeaker] = useState(c.speaker ?? "");
  const [topic, setTopic] = useState(c.topic ?? "");
  const [bio, setBio] = useState(c.bio ?? "");
  const [lyrics, setLyrics] = useState(c.lyrics ?? "");

  const save = async () => {
    let content: ItemContent;
    if (itemType === "announcement") content = { body: body.trim() };
    else if (itemType === "speaker")
      content = { speaker: speaker.trim(), topic: topic.trim(), bio: bio.trim() };
    else content = { lyrics: lyrics.trim() };
    await runSafe(() =>
      updateItem(item.id, {
        title: title.trim(),
        duration: Number(duration) || 0,
        itemType,
        content,
      }),
    );
    onSaved();
  };

  return (
    <div className="space-y-3 border-t border-border bg-muted/30 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_120px]">
        <TextInput label="Title" value={title} onChange={setTitle} />
        <div>
          <label className="text-xs font-medium text-muted-foreground">Type</label>
          <select
            value={itemType}
            onChange={(e) => setItemType(e.target.value as ItemType)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="announcement">Announcement</option>
            <option value="speaker">Speaker</option>
            <option value="song">Song</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Duration (min)</label>
          <input
            type="number"
            min={0}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      {itemType === "announcement" && (
        <Textarea label="Body" value={body} onChange={setBody} rows={3} />
      )}
      {itemType === "speaker" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput label="Speaker name" value={speaker} onChange={setSpeaker} />
          <TextInput label="Topic" value={topic} onChange={setTopic} />
          <div className="sm:col-span-2">
            <Textarea label="Bio" value={bio} onChange={setBio} rows={3} />
          </div>
        </div>
      )}
      {itemType === "song" && (
        <Textarea label="Lyrics" value={lyrics} onChange={setLyrics} rows={6} mono />
      )}
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
        >
          Cancel
        </button>
        <button
          onClick={() => void save()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Save
        </button>
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
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles}`}
    >
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

// ---------- AI Smart Import ----------

function SmartImport({ programId }: { programId: string }) {
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
      await addItemsBulk(sanitized, programId);
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
            placeholder={"Paste your bulletin or schedule here…"}
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
        </div>
      )}
    </section>
  );
}
