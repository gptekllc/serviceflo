import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
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
  EllipsisVertical,
  FileImage,
  Grid2X2,
  List,
  Plus,
  Presentation,
  Table2,
  Upload,
} from "lucide-react";
import {
  addItem,
  addItemsBulk,
  advancePresentation,
  assetToImageContent,
  countPowerPointSlides,
  clearStageMessage,
  clearPresentationTarget,
  createProgram,
  deleteItem,
  deleteProgram,
  duplicateItem,
  renameProgram,
  reorderItems,
  sendStageMessage,
  setPresentationItem,
  setPresentationSlideIndex,
  setActiveProgram,
  subscribeItems,
  subscribeProgramAssets,
  subscribePresentationOutputs,
  subscribePrograms,
  subscribeStageMessage,
  updateProgramAppearance,
  updateItem,
  uploadProgramImage,
  uploadProgramPowerPoint,
  type AnnouncementContent,
  type ImageContent,
  type ItemContent,
  type ItemType,
  type PresentationOutput,
  type PresentationTarget,
  type Program,
  type ProgramAsset,
  type ProgramAssetType,
  type ProgramItem,
  type ScreenAspectRatio,
  type SongContent,
  SCREEN_ASPECT_RATIO_OPTIONS,
  type StageMessage,
  type SpeakerContent,
} from "@/lib/programs";
import { parseBulletin, type ParsedItem } from "@/lib/ai-import.functions";
import { ensureMyCoordinatorRole } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  image: "Image",
};

function isPowerPointItem(item: ProgramItem): boolean {
  const content = (item.content ?? {}) as Partial<ImageContent>;
  return item.itemType === "image" && content.kind === "pptx" && !!content.pptxUrl;
}

function itemTypeLabel(item: Pick<ProgramItem, "itemType" | "content">): string {
  return isPowerPointItem(item as ProgramItem) ? "PowerPoint" : TYPE_LABEL[item.itemType];
}

type PushMode = "separate" | "together";
type AddItemKind = ItemType | "pptx";
type AssetSource = "upload" | "library";
type AssetLibraryTab = "all" | ProgramAssetType;
type AssetLibraryView = "list" | "card" | "table";
type CoordinatorSectionKey =
  | "stageMessage"
  | "programSwitcher"
  | "playback"
  | "smartImport"
  | "library"
  | "addItem"
  | "programItems";

function toDateTimeLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function parseDateTimeLocalInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid publish time");
  }
  return parsed.toISOString();
}

function isFutureAnnouncement(item: ProgramItem): boolean {
  return (
    item.itemType === "announcement" &&
    !!item.publishedAt &&
    new Date(item.publishedAt).getTime() > Date.now()
  );
}

function AdminPage() {
  const navigate = useNavigate();
  const ensureCoordinatorRole = useServerFn(ensureMyCoordinatorRole);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        await ensureCoordinatorRole();
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <CoordinatorView onSignOut={handleSignOut} />;
}

function CoordinatorView({ onSignOut }: { onSignOut: () => void }) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<ProgramItem[]>([]);
  const [assets, setAssets] = useState<ProgramAsset[]>([]);
  const [outputs, setOutputs] = useState<PresentationOutput[]>([]);
  const [pushMode, setPushMode] = useState<PushMode>("separate");
  const [openSections, setOpenSections] = useState<Record<CoordinatorSectionKey, boolean>>({
    stageMessage: true,
    programSwitcher: true,
    playback: true,
    smartImport: true,
    library: true,
    addItem: true,
    programItems: true,
  });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => subscribePrograms(setPrograms), []);
  useEffect(() => subscribeProgramAssets(setAssets), []);

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

  useEffect(() => {
    if (!selectedId) {
      setOutputs([]);
      return;
    }
    return subscribePresentationOutputs(setOutputs, selectedId);
  }, [selectedId]);

  const active = useMemo(() => programs.find((p) => p.isActive) ?? null, [programs]);

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

  const toggleSection = (key: CoordinatorSectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1500px] px-6 py-10">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Event Coordinator</h1>
          <div className="flex items-center gap-4">
            <Link
              to="/users"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Users
            </Link>
            <button
              onClick={onSignOut}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="min-w-0">
            <CollapsibleSection
              title="Program settings"
              open={openSections.programSwitcher}
              onToggle={() => toggleSection("programSwitcher")}
            >
              <ProgramSwitcher
                programs={programs}
                selected={selected}
                onSelect={setSelectedId}
                onError={setErr}
              />
            </CollapsibleSection>

            {selected && (
              <>
                <CollapsibleSection
                  title="Smart import"
                  open={openSections.smartImport}
                  onToggle={() => toggleSection("smartImport")}
                >
                  <SmartImport programId={selected.id} />
                </CollapsibleSection>

                {err && (
                  <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {err}
                  </div>
                )}

                <CollapsibleSection
                  title="Library"
                  open={openSections.library}
                  onToggle={() => toggleSection("library")}
                >
                  <AssetLibrary programId={selected.id} assets={assets} onError={setErr} />
                </CollapsibleSection>

                <CollapsibleSection
                  title="Program items"
                  open={openSections.programItems}
                  onToggle={() => toggleSection("programItems")}
                >
                  <ItemList
                    items={items}
                    outputs={outputs}
                    programId={selected.id}
                    pushMode={pushMode}
                    onError={setErr}
                    runSafe={runSafe}
                  />
                </CollapsibleSection>

                <CollapsibleSection
                  title="Add item"
                  open={openSections.addItem}
                  onToggle={() => toggleSection("addItem")}
                >
                  <AddItemForm programId={selected.id} assets={assets} onError={setErr} />
                </CollapsibleSection>

                <CollapsibleSection
                  title="Playback controls"
                  open={openSections.playback}
                  onToggle={() => toggleSection("playback")}
                >
                  <PlaybackControls
                    program={selected}
                    items={items}
                    outputs={outputs}
                    pushMode={pushMode}
                    onPushModeChange={setPushMode}
                    onError={setErr}
                  />
                </CollapsibleSection>
              </>
            )}
          </div>

          <aside className="min-w-0 space-y-4 xl:sticky xl:top-6 xl:h-fit">
            <LivePreviewPanel
              activeProgram={active}
              stageMessageOpen={openSections.stageMessage}
              onStageMessageToggle={() => toggleSection("stageMessage")}
              onError={setErr}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

function StageMessagePanel({ activeProgram }: { activeProgram: Program | null }) {
  const [message, setMessage] = useState("");
  const [current, setCurrent] = useState<StageMessage | null>(null);
  const [busy, setBusy] = useState<"send" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disabled = !activeProgram || busy !== null;

  useEffect(() => {
    setCurrent(null);
    setMessage("");
    if (!activeProgram) return;
    return subscribeStageMessage(setCurrent, activeProgram.id);
  }, [activeProgram]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeProgram) return;
    setError(null);
    setBusy("send");
    try {
      const next = await sendStageMessage(activeProgram.id, message);
      setCurrent(next);
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const clear = async () => {
    if (!activeProgram) return;
    setError(null);
    setBusy("clear");
    try {
      await clearStageMessage(activeProgram.id);
      setCurrent(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Stage-only message
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {activeProgram
              ? `Visible on /stage for "${activeProgram.name}" only.`
              : "Set a program as active to send a stage-only message."}
          </div>
        </div>
        {current?.message && (
          <button
            type="button"
            onClick={() => void clear()}
            disabled={disabled}
            className="rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {busy === "clear" ? "Clearing…" : "Clear"}
          </button>
        )}
      </div>

      {current?.message && (
        <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Live on stage
          </div>
          <div className="mt-1 whitespace-pre-line text-sm text-foreground">{current.message}</div>
        </div>
      )}

      <form onSubmit={(event) => void send(event)} className="mt-3 space-y-3">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          maxLength={500}
          placeholder="Type a private stage message..."
          disabled={disabled}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] tabular-nums text-muted-foreground">{message.length}/500</div>
          <button
            type="submit"
            disabled={disabled || !message.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy === "send" ? "Sending…" : "Send to stage"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </section>
  );
}

function PrePublishPreviewPanel({
  selectedProgram,
  items,
  outputs,
}: {
  selectedProgram: Program | null;
  items: ProgramItem[];
  outputs: PresentationOutput[];
}) {
  const outputByTarget = useMemo(
    () => new Map(outputs.map((output) => [output.target, output.itemId])),
    [outputs],
  );

  const audienceItem = items.find((item) => item.id === outputByTarget.get("audience")) ?? null;
  const stageItem = items.find((item) => item.id === outputByTarget.get("stage")) ?? null;

  const audienceQueue = useMemo(
    () => nextQueuedItems(items, audienceItem?.orderIndex ?? null),
    [items, audienceItem],
  );
  const stageQueue = useMemo(
    () => nextQueuedItems(items, stageItem?.orderIndex ?? null),
    [items, stageItem],
  );

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Preview screen
      </div>
      <h2 className="mt-2 text-lg font-semibold tracking-tight">Pre-publish check</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {selectedProgram
          ? `${selectedProgram.name}${selectedProgram.isActive ? " (active)" : " (not active)"}`
          : "Select a program to preview routed content and queue."}
      </p>

      {selectedProgram ? (
        <div className="mt-4 space-y-4">
          <ScreenStylePreviewCard label="Audience" current={audienceItem} queue={audienceQueue} />
          <ScreenStylePreviewCard label="Stage" current={stageItem} queue={stageQueue} />
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-border px-3 py-5 text-sm text-muted-foreground">
          No program selected.
        </div>
      )}
    </section>
  );
}

function ScreenStylePreviewCard({
  label,
  current,
  queue,
}: {
  label: "Audience" | "Stage";
  current: ProgramItem | null;
  queue: ProgramItem[];
}) {
  const isAudience = label === "Audience";
  const shellClass = isAudience
    ? "bg-[#05070b] text-white border-white/10"
    : "bg-zinc-950 text-zinc-50 border-white/10";
  const subtitleClass = isAudience ? "text-cyan-300/80" : "text-cyan-300/70";
  const mutedClass = isAudience ? "text-white/60" : "text-zinc-400";
  const detail = current ? previewItemDetail(current) : "Set an item to route this screen.";

  return (
    <article className={`rounded-xl border p-3 shadow-sm ${shellClass}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
        <div className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${subtitleClass}`}>
          {label} preview
        </div>
        <div className={`text-[10px] uppercase tracking-[0.18em] ${mutedClass}`}>
          {current ? `${itemTypeLabel(current)} · ${current.duration}m` : "standby"}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div className="text-lg font-semibold leading-tight">
          {current?.title ?? "Nothing selected"}
        </div>
        <div className={`mt-2 text-xs leading-relaxed ${mutedClass}`}>{detail}</div>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${mutedClass}`}>
          Queue
        </div>
        {queue.length === 0 ? (
          <div className={`mt-1 text-xs ${mutedClass}`}>No queued items.</div>
        ) : (
          <ol className="mt-1 space-y-1.5">
            {queue.map((item, idx) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  {idx + 1}. {item.title}
                </span>
                <span className={mutedClass}>{item.duration}m</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}

function previewItemDetail(item: ProgramItem): string {
  if (item.itemType === "speaker") {
    const content = (item.content ?? {}) as Partial<SpeakerContent>;
    return (
      content.topic?.trim() || content.bio?.trim() || content.speaker?.trim() || "Speaker details"
    );
  }
  if (item.itemType === "song") {
    const content = (item.content ?? {}) as Partial<SongContent>;
    return content.lyrics?.trim() || "Song lyrics will appear here.";
  }
  if (item.itemType === "image") {
    const content = (item.content ?? {}) as Partial<ImageContent>;
    if (isPowerPointItem(item)) {
      return content.fileName?.trim() || "PowerPoint deck.";
    }
    return content.fileName?.trim() || content.alt?.trim() || "Uploaded image slide.";
  }
  const content = (item.content ?? {}) as Partial<AnnouncementContent>;
  return content.body?.trim() || "Announcement details will appear here.";
}

function nextQueuedItems(items: ProgramItem[], fromOrderIndex: number | null): ProgramItem[] {
  const ordered = [...items].sort((a, b) => a.orderIndex - b.orderIndex);
  if (ordered.length === 0) return [];
  if (fromOrderIndex == null) return ordered.slice(0, 3);
  return ordered.filter((item) => item.orderIndex > fromOrderIndex).slice(0, 3);
}

function LivePreviewPanel({
  activeProgram,
  stageMessageOpen,
  onStageMessageToggle,
  onError,
}: {
  activeProgram: Program | null;
  stageMessageOpen: boolean;
  onStageMessageToggle: () => void;
  onError: (msg: string | null) => void;
}) {
  const [popout, setPopout] = useState<{
    label: "Audience" | "Stage";
    src: "/screen" | "/stage";
    aspectRatio: ScreenAspectRatio;
  } | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(true);

  return (
    <>
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Live previews
        </div>
        <h2 className="mt-2 text-lg font-semibold tracking-tight">Published screens</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {activeProgram
            ? `${activeProgram.name} · code ${activeProgram.joinCode}`
            : "No active program. Screen previews are in standby."}
        </p>

        <div className="mt-4 space-y-4">
          <PreviewFrame
            label="Audience"
            src="/screen"
            aspectRatio={activeProgram?.audienceAspectRatio ?? "16:9"}
            onPopOut={(payload) => setPopout(payload)}
          />
          <PreviewFrame
            label="Stage"
            src="/stage"
            aspectRatio={activeProgram?.stageAspectRatio ?? "16:9"}
            onPopOut={(payload) => setPopout(payload)}
          />
          <CollapsibleSection
            title="Stage message"
            open={stageMessageOpen}
            onToggle={onStageMessageToggle}
          >
            <StageMessagePanel activeProgram={activeProgram} />
          </CollapsibleSection>
          {activeProgram && (
            <div className="overflow-hidden rounded-lg border border-border bg-background">
              <button
                type="button"
                onClick={() => setAppearanceOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-accent"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Screen appearance
                </span>
                <span className="text-xs text-muted-foreground">
                  {appearanceOpen ? "Hide" : "Show"}
                </span>
              </button>
              {appearanceOpen && (
                <ScreenRatioControls
                  program={activeProgram}
                  disabled={false}
                  onError={onError}
                  className="border-t border-border bg-background/70 p-3"
                />
              )}
            </div>
          )}
        </div>
      </section>

      <Dialog open={popout !== null} onOpenChange={(open) => !open && setPopout(null)}>
        <DialogContent className="max-w-[96vw] w-[96vw] p-4">
          <DialogTitle className="pr-8">{popout?.label ?? "Screen"} live preview</DialogTitle>
          {popout && (
            <div
              className="overflow-hidden rounded-md border border-border bg-black"
              style={{ aspectRatio: cssAspectRatio(popout.aspectRatio) }}
            >
              <iframe
                src={popout.src}
                title={`${popout.label} live preview dialog`}
                className="h-full w-full border-0"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreviewFrame({
  label,
  src,
  aspectRatio,
  onPopOut,
}: {
  label: "Audience" | "Stage";
  src: "/screen" | "/stage";
  aspectRatio: ScreenAspectRatio;
  onPopOut: (payload: {
    label: "Audience" | "Stage";
    src: "/screen" | "/stage";
    aspectRatio: ScreenAspectRatio;
  }) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const { baseWidth, baseHeight } = baseFrameSize(aspectRatio);
  const scale = containerWidth > 0 ? containerWidth / baseWidth : 0;

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    const el = containerRef.current;
    const obs = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <article className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label} screen
        </div>
        <button
          type="button"
          onClick={() => onPopOut({ label, src, aspectRatio })}
          className="rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground hover:bg-accent"
        >
          Pop out
        </button>
      </div>
      <div
        ref={containerRef}
        className="overflow-hidden rounded-md border border-border bg-black"
        style={{ aspectRatio: cssAspectRatio(aspectRatio) }}
      >
        <div className="relative h-full w-full">
          <iframe
            src={src}
            title={`${label} live preview`}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute left-0 top-0 border-0"
            style={{
              width: `${baseWidth}px`,
              height: `${baseHeight}px`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      </div>
    </article>
  );
}

function cssAspectRatio(ratio: ScreenAspectRatio): string {
  const [w, h] = ratio.split(":");
  return `${w} / ${h}`;
}

function baseFrameSize(ratio: ScreenAspectRatio): { baseWidth: number; baseHeight: number } {
  const [wStr, hStr] = ratio.split(":");
  const w = Number(wStr);
  const h = Number(hStr);
  const baseHeight = 1080;
  const baseWidth = Math.round((baseHeight * w) / h);
  return { baseWidth, baseHeight };
}

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 rounded-lg border border-border bg-card/40 p-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
      >
        <span className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </span>
        <span className="text-sm text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
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
  const [copied, setCopied] = useState(false);

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

  const handleCopyJoinLink = async () => {
    if (!selected || typeof window === "undefined") return;
    const link = new URL(
      `/mobile?code=${encodeURIComponent(selected.joinCode)}`,
      window.location.origin,
    ).toString();
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
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
      {selected && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-3">
          <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Join code</div>
          <div className="font-mono text-lg font-semibold tracking-[0.18em]">
            {selected.joinCode}
          </div>
          <button
            onClick={() => void handleCopyJoinLink()}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
          >
            {copied ? "Copied" : "Copy mobile link"}
          </button>
        </div>
      )}
    </section>
  );
}

// ---------- Playback controls ----------

function PlaybackControls({
  program,
  items,
  outputs,
  pushMode,
  onPushModeChange,
  onError,
}: {
  program: Program;
  items: ProgramItem[];
  outputs: PresentationOutput[];
  pushMode: PushMode;
  onPushModeChange: (value: PushMode) => void;
  onError: (msg: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const outputByTarget = useMemo(
    () => new Map(outputs.map((output) => [output.target, output])),
    [outputs],
  );
  const audienceOutput = outputByTarget.get("audience");
  const audienceItem = items.find((item) => item.id === audienceOutput?.itemId);

  const runCombinedAdvance = async (direction: "next" | "previous") => {
    const nextId = await advancePresentation(program.id, "audience", direction);
    if (!nextId) {
      await clearPresentationTarget(program.id, "both");
      return;
    }
    await setPresentationItem(nextId, program.id, "both");
  };

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-background/70 p-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Push mode
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Choose whether push/transport controls operate per-screen or both together.
          </div>
        </div>
        <div className="inline-flex rounded-md border border-input bg-background p-1">
          <button
            type="button"
            onClick={() => onPushModeChange("separate")}
            className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
              pushMode === "separate"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            Separate
          </button>
          <button
            type="button"
            onClick={() => onPushModeChange("together")}
            className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
              pushMode === "together"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            Together
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        <TargetPlaybackCard
          target="audience"
          item={audienceItem}
          output={audienceOutput}
          busy={busy}
          onPrevious={() =>
            void run(() =>
              pushMode === "together"
                ? runCombinedAdvance("previous")
                : advancePresentation(program.id, "audience", "previous"),
            )
          }
          onClear={() =>
            void run(() =>
              clearPresentationTarget(program.id, pushMode === "together" ? "both" : "audience"),
            )
          }
          onNext={() =>
            void run(() =>
              pushMode === "together"
                ? runCombinedAdvance("next")
                : advancePresentation(program.id, "audience", "next"),
            )
          }
          onSetSlideIndex={(slideIndex) =>
            void run(() =>
              setPresentationSlideIndex(
                program.id,
                pushMode === "together" ? "both" : "audience",
                slideIndex,
              ),
            )
          }
        />
      </div>
      {!program.isActive && (
        <div className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          This program isn't active. Audience and stage routes follow the active program only.
        </div>
      )}
    </section>
  );
}

function ScreenRatioControls({
  program,
  disabled,
  onError,
  className = "mb-4 rounded-lg border border-border bg-background/70 p-3",
}: {
  program: Program;
  disabled: boolean;
  onError: (msg: string | null) => void;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    onError(null);
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const isDisabled = disabled || saving;

  return (
    <div className={className}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Screen appearance
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        Pick each output screen's ratio and background color.
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground">
          Audience ratio
          <select
            value={program.audienceAspectRatio}
            disabled={isDisabled}
            onChange={(e) =>
              void run(() =>
                updateProgramAppearance(program.id, {
                  audienceAspectRatio: e.target.value as ScreenAspectRatio,
                }),
              )
            }
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {SCREEN_ASPECT_RATIO_OPTIONS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-muted-foreground">
          Stage ratio
          <select
            value={program.stageAspectRatio}
            disabled={isDisabled}
            onChange={(e) =>
              void run(() =>
                updateProgramAppearance(program.id, {
                  stageAspectRatio: e.target.value as ScreenAspectRatio,
                }),
              )
            }
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {SCREEN_ASPECT_RATIO_OPTIONS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-muted-foreground">
          Audience background
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={program.audienceBackgroundColor}
              disabled={isDisabled}
              onChange={(e) =>
                void run(() =>
                  updateProgramAppearance(program.id, {
                    audienceBackgroundColor: e.target.value,
                  }),
                )
              }
              className="h-10 w-12 rounded-md border border-input bg-background p-1"
            />
            <input
              value={program.audienceBackgroundColor}
              disabled={isDisabled}
              readOnly
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </label>

        <label className="text-xs font-medium text-muted-foreground">
          Stage background
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={program.stageBackgroundColor}
              disabled={isDisabled}
              onChange={(e) =>
                void run(() =>
                  updateProgramAppearance(program.id, {
                    stageBackgroundColor: e.target.value,
                  }),
                )
              }
              className="h-10 w-12 rounded-md border border-input bg-background p-1"
            />
            <input
              value={program.stageBackgroundColor}
              disabled={isDisabled}
              readOnly
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </label>
      </div>
    </div>
  );
}

function TargetPlaybackCard({
  target,
  item,
  output,
  busy,
  onPrevious,
  onClear,
  onNext,
  onSetSlideIndex,
}: {
  target: PresentationTarget;
  item: ProgramItem | undefined;
  output: PresentationOutput | undefined;
  busy: boolean;
  onPrevious: () => void;
  onClear: () => void;
  onNext: () => void;
  onSetSlideIndex: (slideIndex: number) => void;
}) {
  const label = target === "audience" ? "Audience screen" : "Stage screen";

  return (
    <div className="rounded-lg border border-border bg-background/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 truncate text-base font-semibold">
            {item?.title ?? `Nothing on ${target}`}
          </div>
          {item ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{itemTypeLabel(item)}</span>
              <span>{item.duration} min</span>
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted-foreground">Standby</div>
          )}
          {target === "audience" && item && <LiveCountdown item={item} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onPrevious}
            disabled={busy || !item}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
          >
            ← Previous
          </button>
          <button
            onClick={onClear}
            disabled={busy || !item}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
          >
            Clear
          </button>
          <button
            onClick={onNext}
            disabled={busy}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>
      {item && isPowerPointItem(item) && (
        <PowerPointSlideControls
          item={item}
          output={output}
          busy={busy}
          onSetSlideIndex={onSetSlideIndex}
        />
      )}
    </div>
  );
}

function PowerPointSlideControls({
  item,
  output,
  busy,
  onSetSlideIndex,
}: {
  item: ProgramItem;
  output: PresentationOutput | undefined;
  busy: boolean;
  onSetSlideIndex: (slideIndex: number) => void;
}) {
  const content = useMemo(() => (item.content ?? {}) as Partial<ImageContent>, [item.content]);
  const savedSlideCount = typeof content.slideCount === "number" ? content.slideCount : 0;
  const [detectedSlideCount, setDetectedSlideCount] = useState(savedSlideCount);
  const [isReadingSlides, setIsReadingSlides] = useState(false);
  const slideCount = savedSlideCount || detectedSlideCount;
  const slideIndex = Math.min(Math.max(output?.slideIndex ?? 0, 0), Math.max(slideCount - 1, 0));
  const canControlSlides = !busy && slideCount > 1;
  const canGoPrevious = canControlSlides && slideIndex > 0;
  const canGoNext = canControlSlides && slideIndex < slideCount - 1;

  useEffect(() => {
    setDetectedSlideCount(savedSlideCount);
  }, [savedSlideCount, item.id]);

  useEffect(() => {
    if (savedSlideCount || !content.pptxUrl) return;
    let cancelled = false;
    setIsReadingSlides(true);
    void (async () => {
      try {
        const response = await fetch(content.pptxUrl as string);
        if (!response.ok) throw new Error("Could not read PowerPoint");
        const count = await countPowerPointSlides(await response.arrayBuffer());
        if (cancelled) return;
        setDetectedSlideCount(count);
        if (count > 0) {
          await updateItem(item.id, {
            content: { ...(content as ImageContent), slideCount: count },
          });
        }
      } catch (error) {
        console.error("[pptx] slide count failed:", error);
      } finally {
        if (!cancelled) setIsReadingSlides(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [content, item.id, savedSlideCount]);

  return (
    <div className="mt-4 rounded-md border border-border bg-card px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            PowerPoint slides
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {slideCount > 0
              ? `Slide ${slideIndex + 1} of ${slideCount}`
              : isReadingSlides
                ? "Reading slide count..."
                : "Slide count unavailable"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSetSlideIndex(0)}
            disabled={!canGoPrevious}
            className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40"
          >
            First
          </button>
          <button
            type="button"
            onClick={() => onSetSlideIndex(slideIndex - 1)}
            disabled={!canGoPrevious}
            className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40"
          >
            Previous slide
          </button>
          <button
            type="button"
            onClick={() => onSetSlideIndex(slideIndex + 1)}
            disabled={!canGoNext}
            className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40"
          >
            Next slide
          </button>
          <button
            type="button"
            onClick={() => onSetSlideIndex(slideCount - 1)}
            disabled={!canGoNext}
            className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40"
          >
            Last
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveCountdown({ item }: { item: ProgramItem }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!item.liveStartedAt || item.duration <= 0) {
    return <div className="mt-0.5 text-xs text-muted-foreground">{item.duration} min</div>;
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

// ---------- Asset library ----------

function AssetLibrary({
  programId,
  assets,
  onError,
}: {
  programId: string;
  assets: ProgramAsset[];
  onError: (msg: string | null) => void;
}) {
  const [tab, setTab] = useState<AssetLibraryTab>("all");
  const [view, setView] = useState<AssetLibraryView>("card");
  const [busy, setBusy] = useState<ProgramAssetType | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pptxInputRef = useRef<HTMLInputElement | null>(null);

  const visibleAssets = useMemo(
    () => assets.filter((asset) => tab === "all" || asset.assetType === tab),
    [assets, tab],
  );
  const imageCount = assets.filter((asset) => asset.assetType === "image").length;
  const pptxCount = assets.filter((asset) => asset.assetType === "pptx").length;

  const upload = async (type: ProgramAssetType, file: File | null) => {
    if (!file) return;
    setBusy(type);
    onError(null);
    try {
      if (type === "image") {
        await uploadProgramImage(programId, file);
      } else {
        await uploadProgramPowerPoint(programId, file);
      }
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-6 space-y-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            File library
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Upload images and PowerPoint decks once, then reuse them from Add item.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              void upload("image", event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={pptxInputRef}
            type="file"
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="hidden"
            onChange={(event) => {
              void upload("pptx", event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {busy === "image" ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Image
          </button>
          <button
            type="button"
            onClick={() => pptxInputRef.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {busy === "pptx" ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            PowerPoint
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
          <AssetTabButton active={tab === "all"} onClick={() => setTab("all")}>
            All {assets.length}
          </AssetTabButton>
          <AssetTabButton active={tab === "image"} onClick={() => setTab("image")}>
            Images {imageCount}
          </AssetTabButton>
          <AssetTabButton active={tab === "pptx"} onClick={() => setTab("pptx")}>
            PowerPoint {pptxCount}
          </AssetTabButton>
        </div>
        <div className="flex w-fit gap-1 rounded-md bg-muted p-1">
          <AssetViewButton active={view === "list"} label="List" onClick={() => setView("list")}>
            <List className="h-4 w-4" />
          </AssetViewButton>
          <AssetViewButton active={view === "card"} label="Cards" onClick={() => setView("card")}>
            <Grid2X2 className="h-4 w-4" />
          </AssetViewButton>
          <AssetViewButton active={view === "table"} label="Table" onClick={() => setView("table")}>
            <Table2 className="h-4 w-4" />
          </AssetViewButton>
        </div>
      </div>

      {visibleAssets.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No files in this tab yet.
        </div>
      ) : view === "table" ? (
        <AssetTable assets={visibleAssets} />
      ) : view === "list" ? (
        <div className="space-y-2">
          {visibleAssets.map((asset) => (
            <AssetListRow key={asset.id} asset={asset} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleAssets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-xs font-medium ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function AssetViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function AssetIcon({ asset }: { asset: ProgramAsset }) {
  return asset.assetType === "pptx" ? (
    <Presentation className="h-4 w-4 text-orange-600" />
  ) : (
    <FileImage className="h-4 w-4 text-sky-600" />
  );
}

function AssetPreview({ asset }: { asset: ProgramAsset }) {
  if (asset.assetType === "image") {
    return (
      <div className="grid aspect-video place-items-center overflow-hidden rounded-md bg-black">
        <img
          src={asset.publicUrl}
          alt={asset.alt || asset.title}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="grid aspect-video place-items-center rounded-md border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-950 dark:bg-orange-950/30 dark:text-orange-300">
      <Presentation className="h-8 w-8" />
    </div>
  );
}

function AssetCard({ asset }: { asset: ProgramAsset }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <AssetPreview asset={asset} />
      <div className="mt-3 flex min-w-0 items-start gap-2">
        <AssetIcon asset={asset} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{asset.title}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{asset.fileName}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {assetTypeLabel(asset)} · {formatFileSize(asset.fileSize)} ·{" "}
            {formatAssetDate(asset.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function AssetListRow({ asset }: { asset: ProgramAsset }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
      <AssetIcon asset={asset} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{asset.title}</div>
        <div className="truncate text-xs text-muted-foreground">{asset.fileName}</div>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        <div>{assetTypeLabel(asset)}</div>
        <div>{formatFileSize(asset.fileSize)}</div>
      </div>
    </div>
  );
}

function AssetTable({ assets }: { assets: ProgramAsset[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Name</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">File</th>
            <th className="px-3 py-2 text-right font-medium">Size</th>
            <th className="px-3 py-2 text-right font-medium">Uploaded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {assets.map((asset) => (
            <tr key={asset.id} className="bg-card">
              <td className="px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <AssetIcon asset={asset} />
                  <span className="truncate font-medium">{asset.title}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{assetTypeLabel(asset)}</td>
              <td className="max-w-[260px] truncate px-3 py-2 text-muted-foreground">
                {asset.fileName}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {formatFileSize(asset.fileSize)}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {formatAssetDate(asset.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function assetTypeLabel(asset: Pick<ProgramAsset, "assetType">): string {
  return asset.assetType === "pptx" ? "PowerPoint" : "Image";
}

function formatFileSize(size: number | null): string {
  if (!size || size <= 0) return "Unknown";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

function formatAssetDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value),
  );
}

// ---------- Add item ----------

function AddItemForm({
  programId,
  assets,
  onError,
}: {
  programId: string;
  assets: ProgramAsset[];
  onError: (msg: string | null) => void;
}) {
  const [itemKind, setItemKind] = useState<AddItemKind>("announcement");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("5");
  const [body, setBody] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [priority, setPriority] = useState("0");
  const [speaker, setSpeaker] = useState("");
  const [topic, setTopic] = useState("");
  const [bio, setBio] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pptxFile, setPptxFile] = useState<File | null>(null);
  const [assetSource, setAssetSource] = useState<AssetSource>("upload");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [imageFit, setImageFit] = useState<ImageContent["fit"]>("contain");
  const [imageAlt, setImageAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const mediaAssetType: ProgramAssetType | null =
    itemKind === "image" ? "image" : itemKind === "pptx" ? "pptx" : null;
  const mediaAssets = useMemo(
    () => assets.filter((asset) => asset.assetType === mediaAssetType),
    [assets, mediaAssetType],
  );
  const selectedAsset = mediaAssets.find((asset) => asset.id === selectedAssetId) ?? null;

  const reset = () => {
    setTitle("");
    setDuration("5");
    setBody("");
    setPublishAt("");
    setIsPinned(false);
    setPriority("0");
    setSpeaker("");
    setTopic("");
    setBio("");
    setLyrics("");
    setImageFile(null);
    setPptxFile(null);
    setAssetSource("upload");
    setSelectedAssetId(null);
    setImageFit("contain");
    setImageAlt("");
  };

  const selectAsset = (asset: ProgramAsset) => {
    setSelectedAssetId(asset.id);
    if (!title.trim()) setTitle(asset.title);
    if (asset.assetType === "image") setImageFit(asset.fit);
    if (!imageAlt.trim()) setImageAlt(asset.alt);
  };

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() && itemKind !== "image" && itemKind !== "pptx") return;
    if (itemKind === "image" && assetSource === "upload" && !imageFile) {
      onError("Choose an image file to upload.");
      return;
    }
    if (itemKind === "image" && assetSource === "library" && !selectedAsset) {
      onError("Choose an image from the library.");
      return;
    }
    if (itemKind === "pptx" && assetSource === "upload" && !pptxFile) {
      onError("Choose a PowerPoint file to upload.");
      return;
    }
    if (itemKind === "pptx" && assetSource === "library" && !selectedAsset) {
      onError("Choose a PowerPoint file from the library.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      let content: ItemContent;
      if (itemKind === "announcement") content = { body: body.trim() };
      else if (itemKind === "speaker")
        content = { speaker: speaker.trim(), topic: topic.trim(), bio: bio.trim() };
      else if (itemKind === "song") content = { lyrics: lyrics.trim() };
      else if (itemKind === "image") {
        const uploaded =
          assetSource === "library" && selectedAsset
            ? assetToImageContent(selectedAsset)
            : imageFile
              ? await uploadProgramImage(programId, imageFile)
              : null;
        if (!uploaded || uploaded.kind === "pptx") throw new Error("Choose an image file.");
        content = {
          ...uploaded,
          kind: "image",
          fit: imageFit,
          alt: imageAlt.trim() || title.trim() || uploaded.alt,
        };
      } else {
        const uploaded =
          assetSource === "library" && selectedAsset
            ? assetToImageContent(selectedAsset)
            : pptxFile
              ? await uploadProgramPowerPoint(programId, pptxFile)
              : null;
        if (!uploaded || uploaded.kind !== "pptx") throw new Error("Choose a PowerPoint file.");
        content = uploaded;
      }
      await addItem(
        {
          title:
            title.trim() ||
            selectedAsset?.title ||
            imageFile?.name.replace(/\.[^.]+$/, "") ||
            pptxFile?.name.replace(/\.[^.]+$/, "") ||
            "Presentation",
          duration: Number(duration) || 0,
          itemType: itemKind === "pptx" ? "image" : itemKind,
          content,
          publishedAt: itemKind === "announcement" ? parseDateTimeLocalInput(publishAt) : null,
          isPinned: itemKind === "announcement" ? isPinned : false,
          priority: itemKind === "announcement" ? Number(priority) || 0 : 0,
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
            value={itemKind}
            onChange={(e) => {
              setItemKind(e.target.value as AddItemKind);
              setAssetSource("upload");
              setSelectedAssetId(null);
              setImageFile(null);
              setPptxFile(null);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="announcement">Announcement</option>
            <option value="speaker">Speaker</option>
            <option value="song">Song</option>
            <option value="image">Image</option>
            <option value="pptx">PowerPoint</option>
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
      {itemKind === "announcement" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="sm:col-span-3">
            <Textarea label="Body" value={body} onChange={setBody} rows={3} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Publish at</label>
            <input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <label className="flex items-end gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
            />
            <span>Pin to top</span>
          </label>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}
      {itemKind === "speaker" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput label="Speaker name" value={speaker} onChange={setSpeaker} />
          <TextInput label="Topic" value={topic} onChange={setTopic} />
          <div className="sm:col-span-2">
            <Textarea label="Bio" value={bio} onChange={setBio} rows={3} />
          </div>
        </div>
      )}
      {itemKind === "song" && (
        <Textarea label="Lyrics" value={lyrics} onChange={setLyrics} rows={6} mono />
      )}
      {itemKind === "image" && (
        <div className="space-y-3">
          <AssetSourceToggle value={assetSource} onChange={setAssetSource} />
          {assetSource === "upload" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Image file</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setImageFile(file);
                    if (file && !title.trim()) {
                      setTitle(file.name.replace(/\.[^.]+$/, ""));
                    }
                    if (file && !imageAlt.trim()) {
                      setImageAlt(file.name.replace(/\.[^.]+$/, ""));
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <ImageFitSelect value={imageFit} onChange={setImageFit} />
              <div className="sm:col-span-2">
                <TextInput label="Alt text" value={imageAlt} onChange={setImageAlt} />
              </div>
            </div>
          ) : (
            <>
              <LibraryAssetPicker
                assets={mediaAssets}
                selectedId={selectedAssetId}
                emptyText="No images in the library yet."
                onSelect={selectAsset}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                <ImageFitSelect value={imageFit} onChange={setImageFit} />
                <TextInput label="Alt text" value={imageAlt} onChange={setImageAlt} />
              </div>
            </>
          )}
        </div>
      )}
      {itemKind === "pptx" && (
        <div className="space-y-3">
          <AssetSourceToggle value={assetSource} onChange={setAssetSource} />
          {assetSource === "upload" ? (
            <div>
              <label className="text-xs font-medium text-muted-foreground">PowerPoint file</label>
              <input
                type="file"
                accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setPptxFile(file);
                  if (file && !title.trim()) {
                    setTitle(file.name.replace(/\.[^.]+$/, ""));
                  }
                }}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="mt-1 text-xs text-muted-foreground">
                PPTX files are rendered directly in the browser on /screen and /stage.
              </div>
            </div>
          ) : (
            <LibraryAssetPicker
              assets={mediaAssets}
              selectedId={selectedAssetId}
              emptyText="No PowerPoint files in the library yet."
              onSelect={selectAsset}
            />
          )}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={
            busy ||
            (!title.trim() && itemKind !== "image" && itemKind !== "pptx") ||
            (itemKind === "image" && assetSource === "upload" && !imageFile) ||
            (itemKind === "image" && assetSource === "library" && !selectedAsset) ||
            (itemKind === "pptx" && assetSource === "upload" && !pptxFile) ||
            (itemKind === "pptx" && assetSource === "library" && !selectedAsset)
          }
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {busy
            ? "Adding…"
            : itemKind === "image" || itemKind === "pptx"
              ? assetSource === "library"
                ? "Add from library"
                : itemKind === "image"
                  ? "Upload image slide"
                  : "Upload PowerPoint"
              : "Add item"}
        </button>
      </div>
    </form>
  );
}

function AssetSourceToggle({
  value,
  onChange,
}: {
  value: AssetSource;
  onChange: (value: AssetSource) => void;
}) {
  return (
    <div className="flex w-fit gap-1 rounded-md bg-muted p-1">
      <button
        type="button"
        onClick={() => onChange("upload")}
        className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium ${
          value === "upload"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Upload className="h-3.5 w-3.5" />
        Upload new
      </button>
      <button
        type="button"
        onClick={() => onChange("library")}
        className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium ${
          value === "library"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Grid2X2 className="h-3.5 w-3.5" />
        Library
      </button>
    </div>
  );
}

function ImageFitSelect({
  value,
  onChange,
}: {
  value: ImageContent["fit"];
  onChange: (value: ImageContent["fit"]) => void;
}) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      Fit
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ImageContent["fit"])}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="contain">Contain</option>
        <option value="cover">Cover</option>
      </select>
    </label>
  );
}

function LibraryAssetPicker({
  assets,
  selectedId,
  emptyText,
  onSelect,
}: {
  assets: ProgramAsset[];
  selectedId: string | null;
  emptyText: string;
  onSelect: (asset: ProgramAsset) => void;
}) {
  if (assets.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto rounded-md border border-border bg-background p-2 sm:grid-cols-2">
      {assets.map((asset) => {
        const selected = asset.id === selectedId;
        return (
          <button
            key={asset.id}
            type="button"
            onClick={() => onSelect(asset)}
            className={`grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3 rounded-md border p-2 text-left ${
              selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
            }`}
          >
            {asset.assetType === "image" ? (
              <div className="h-12 w-14 overflow-hidden rounded bg-black">
                <img
                  src={asset.publicUrl}
                  alt={asset.alt || asset.title}
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="grid h-12 w-14 place-items-center rounded bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300">
                <Presentation className="h-5 w-5" />
              </div>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{asset.title}</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {asset.fileName}
              </span>
            </span>
          </button>
        );
      })}
    </div>
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
  outputs,
  programId,
  pushMode,
  onError,
  runSafe,
}: {
  items: ProgramItem[];
  outputs: PresentationOutput[];
  programId: string;
  pushMode: PushMode;
  onError: (msg: string | null) => void;
  runSafe: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
                outputs={outputs}
                programId={programId}
                pushMode={pushMode}
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
  outputs,
  programId,
  pushMode,
  runSafe,
}: {
  item: ProgramItem;
  index: number;
  outputs: PresentationOutput[];
  programId: string;
  pushMode: PushMode;
  runSafe: (fn: () => Promise<void>) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const [editing, setEditing] = useState(false);
  const audienceLive = outputs.some(
    (output) => output.target === "audience" && output.itemId === item.id,
  );
  const stageLive = outputs.some(
    (output) => output.target === "stage" && output.itemId === item.id,
  );

  return (
    <li ref={setNodeRef} style={style} className="rounded-lg border border-border bg-card">
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
              {itemTypeLabel(item)}
            </span>
            {item.itemType === "announcement" && item.isPinned && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                pinned
              </span>
            )}
            {item.itemType === "announcement" && item.priority !== 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-foreground">
                p{item.priority}
              </span>
            )}
            {isFutureAnnouncement(item) && item.publishedAt && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                scheduled {toDateTimeLocalInput(item.publishedAt).replace("T", " ")}
              </span>
            )}
            {audienceLive && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                audience
              </span>
            )}
            {stageLive && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                stage
              </span>
            )}
            <span>{item.duration} min</span>
            <StatusBadge status={item.status} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <button
            onClick={() => void runSafe(() => duplicateItem(item.id, programId))}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
            aria-label="Duplicate"
          >
            Copy
          </button>
          {pushMode === "separate" ? (
            <>
              <button
                onClick={() =>
                  void runSafe(() => setPresentationItem(item.id, programId, "audience"))
                }
                className="rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background hover:opacity-90"
              >
                Audience
              </button>
              <button
                onClick={() => void runSafe(() => setPresentationItem(item.id, programId, "stage"))}
                className="rounded-md border border-emerald-500/40 bg-background px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
              >
                Stage
              </button>
              <button
                onClick={() => void runSafe(() => setPresentationItem(item.id, programId, "both"))}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
              >
                Both
              </button>
            </>
          ) : (
            <button
              onClick={() => void runSafe(() => setPresentationItem(item.id, programId, "both"))}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
            >
              Push both
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Item actions"
                className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
              >
                <EllipsisVertical className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onSelect={() => setEditing((v) => !v)} className="cursor-pointer">
                {editing ? "Close editor" : "Edit"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  if (confirm(`Delete "${item.title}"?`)) {
                    void runSafe(() => deleteItem(item.id));
                  }
                }}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
    AnnouncementContent & SpeakerContent & SongContent & ImageContent
  >;
  const [body, setBody] = useState(c.body ?? "");
  const [publishAt, setPublishAt] = useState(toDateTimeLocalInput(item.publishedAt));
  const [isPinned, setIsPinned] = useState(item.isPinned);
  const [priority, setPriority] = useState(String(item.priority));
  const [speaker, setSpeaker] = useState(c.speaker ?? "");
  const [topic, setTopic] = useState(c.topic ?? "");
  const [bio, setBio] = useState(c.bio ?? "");
  const [lyrics, setLyrics] = useState(c.lyrics ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState(c.imageUrl ?? "");
  const [imageStoragePath, setImageStoragePath] = useState(c.storagePath ?? "");
  const [imageFileName, setImageFileName] = useState(c.fileName ?? "");
  const [imageMimeType, setImageMimeType] = useState(c.mimeType ?? "");
  const [imageFit, setImageFit] = useState<ImageContent["fit"]>(c.fit ?? "contain");
  const [imageAlt, setImageAlt] = useState(c.alt ?? "");

  const save = async () => {
    let content: ItemContent;
    if (itemType === "announcement") content = { body: body.trim() };
    else if (itemType === "speaker")
      content = { speaker: speaker.trim(), topic: topic.trim(), bio: bio.trim() };
    else if (itemType === "song") content = { lyrics: lyrics.trim() };
    else {
      let imageContent: ImageContent;
      if (imageFile) {
        imageContent = await uploadProgramImage(item.programId, imageFile);
      } else if (c.kind === "pptx" && c.pptxUrl) {
        imageContent = {
          kind: "pptx",
          imageUrl: c.imageUrl ?? "",
          pptxUrl: c.pptxUrl,
          storagePath: imageStoragePath,
          fileName: imageFileName || title.trim() || "Presentation",
          mimeType:
            imageMimeType ||
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          fit: imageFit,
          alt: imageAlt.trim() || title.trim(),
        };
      } else if (imageUrl) {
        imageContent = {
          imageUrl,
          storagePath: imageStoragePath,
          fileName: imageFileName || title.trim() || "Image slide",
          mimeType: imageMimeType,
          fit: imageFit,
          alt: imageAlt.trim() || title.trim(),
        };
      } else {
        throw new Error("Choose an image file to upload.");
      }
      content = {
        ...imageContent,
        fit: imageFit,
        alt: imageAlt.trim() || title.trim() || imageContent.alt,
      };
    }
    await runSafe(() =>
      updateItem(item.id, {
        title: title.trim(),
        duration: Number(duration) || 0,
        itemType,
        content,
        publishedAt: itemType === "announcement" ? parseDateTimeLocalInput(publishAt) : null,
        isPinned: itemType === "announcement" ? isPinned : false,
        priority: itemType === "announcement" ? Number(priority) || 0 : 0,
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
            <option value="image">Image</option>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="sm:col-span-3">
            <Textarea label="Body" value={body} onChange={setBody} rows={3} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Publish at</label>
            <input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-end gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
            />
            <span>Pin to top</span>
          </label>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
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
      {itemType === "image" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
          {c.kind === "pptx" && c.pptxUrl ? (
            <div className="sm:col-span-2 rounded-md border border-border bg-background p-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                PowerPoint deck
              </div>
              <div className="mt-1 truncate">{imageFileName || title}</div>
            </div>
          ) : imageUrl ? (
            <div className="sm:col-span-2 overflow-hidden rounded-md border border-border bg-black">
              <img src={imageUrl} alt={imageAlt || title} className="h-40 w-full object-contain" />
            </div>
          ) : null}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Replace image</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setImageFile(file);
                if (file) {
                  setImageFileName(file.name);
                  setImageMimeType(file.type);
                  if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
                  if (!imageAlt.trim()) setImageAlt(file.name.replace(/\.[^.]+$/, ""));
                }
              }}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <label className="text-xs font-medium text-muted-foreground">
            Fit
            <select
              value={imageFit}
              onChange={(e) => setImageFit(e.target.value as ImageContent["fit"])}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
            </select>
          </label>
          <div className="sm:col-span-2">
            <TextInput label="Alt text" value={imageAlt} onChange={setImageAlt} />
          </div>
        </div>
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
                      {itemTypeLabel(p)}
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
