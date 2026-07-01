import { createFileRoute } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  type AnnouncementContent,
  type ImageContent,
  subscribeItems,
  subscribePresentationOutputs,
  subscribePrograms,
  type ItemContent,
  type PresentationOutput,
  type Program,
  type ProgramItem,
  type ScreenAspectRatio,
  type SongContent,
  type SpeakerContent,
} from "../lib/programs";

const STAGE_PANEL_LAYOUT_KEY = "stage-panel-layout-v3";
const DEFAULT_STAGE_PANEL_PERCENT = 75;
const MIN_STAGE_PANEL_PERCENT = 8;
const MAX_STAGE_PANEL_PERCENT = 92;

export const Route = createFileRoute("/stage")({
  head: () => ({
    meta: [
      { title: "Stage — Live Program" },
      { name: "description", content: "Stage confidence monitor." },
    ],
  }),
  component: StagePage,
});

function StagePage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [items, setItems] = useState<ProgramItem[]>([]);
  const [outputs, setOutputs] = useState<PresentationOutput[]>([]);
  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const panelLayoutRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const [leftPanelPercent, setLeftPanelPercent] = useState(DEFAULT_STAGE_PANEL_PERCENT);
  const [hasLoadedPanelLayout, setHasLoadedPanelLayout] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = Number(window.localStorage.getItem(STAGE_PANEL_LAYOUT_KEY));
    if (Number.isFinite(saved)) {
      setLeftPanelPercent(clamp(saved, MIN_STAGE_PANEL_PERCENT, MAX_STAGE_PANEL_PERCENT));
    }
    setHasLoadedPanelLayout(true);
  }, []);

  useEffect(() => subscribePrograms(setPrograms), []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const active = useMemo(() => programs.find((program) => program.isActive), [programs]);

  useEffect(() => {
    if (!active) {
      setItems([]);
      setOutputs([]);
      return;
    }
    const unsubItems = subscribeItems(setItems, active.id);
    const unsubOutputs = subscribePresentationOutputs(setOutputs, active.id);
    return () => {
      unsubItems();
      unsubOutputs();
    };
  }, [active]);

  const outputByTarget = useMemo(
    () => new Map(outputs.map((output) => [output.target, output.itemId])),
    [outputs],
  );
  const stageItem = useMemo(
    () => items.find((item) => item.id === outputByTarget.get("stage")),
    [items, outputByTarget],
  );
  const audienceItem = useMemo(
    () => items.find((item) => item.id === outputByTarget.get("audience")),
    [items, outputByTarget],
  );
  const currentItem = useMemo(
    () => audienceItem ?? items.find((item) => item.status === "live") ?? stageItem,
    [audienceItem, items, stageItem],
  );
  const nextQueued = useMemo(() => {
    if (!currentItem) return items[0] ?? null;
    return items.find((item) => item.orderIndex > currentItem.orderIndex) ?? null;
  }, [items, currentItem]);
  const nextQueuedEta = Math.max(0, currentItem?.duration ?? 0);

  const aspectRatio = active?.stageAspectRatio ?? "16:9";
  const audienceAspectRatio = active?.audienceAspectRatio ?? "16:9";
  const backgroundColor = active?.stageBackgroundColor ?? "#09090b";

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedPanelLayout) return;
    window.localStorage.setItem(STAGE_PANEL_LAYOUT_KEY, String(leftPanelPercent));
  }, [hasLoadedPanelLayout, leftPanelPercent]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === stageHostRef.current);
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.fullscreenElement) {
        void document.exitFullscreen();
      }
    };

    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await stageHostRef.current?.requestFullscreen();
  };

  const updatePanelSize = (clientX: number) => {
    const bounds = panelLayoutRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const next = ((clientX - bounds.left) / bounds.width) * 100;
    setLeftPanelPercent(clamp(next, MIN_STAGE_PANEL_PERCENT, MAX_STAGE_PANEL_PERCENT));
  };

  const handlePanelResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizingPanels(true);
    updatePanelSize(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updatePanelSize(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      setIsResizingPanels(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        void toggleFullscreen();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <div
      className="group relative min-h-screen bg-zinc-950 p-1 text-zinc-50"
      style={{ backgroundColor }}
    >
      <button
        type="button"
        onClick={() => {
          void toggleFullscreen();
        }}
        className="pointer-events-none absolute right-6 top-6 z-20 rounded-md border border-white/20 bg-black/55 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-200 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus:pointer-events-auto focus:opacity-100"
      >
        {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      </button>
      <div
        ref={stageHostRef}
        className="mx-auto flex min-h-[calc(100vh-0.5rem)] max-w-[2200px] items-center justify-center bg-zinc-950"
        style={{ backgroundColor }}
      >
        <div
          onDoubleClick={() => {
            void toggleFullscreen();
          }}
          className="w-full max-h-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
          style={{ aspectRatio: toCssAspectRatio(aspectRatio) }}
        >
          <div className="mx-auto h-full max-w-[1800px] p-[clamp(0.06rem,0.25vw,0.2rem)]">
            <main
              className="flex h-full min-h-0 flex-col rounded-[2rem] bg-[radial-gradient(circle_at_top,rgba(0,255,196,0.12),transparent_40%),rgba(255,255,255,0.03)] p-[clamp(0.12rem,0.45vw,0.3rem)] shadow-2xl"
              style={{ backgroundColor }}
            >
              <div className="flex shrink-0 items-center justify-end px-1 pb-[clamp(0.2rem,0.55vw,0.55rem)] pt-1">
                <div className="font-mono text-[clamp(1rem,2.1vw,2rem)] font-semibold tabular-nums text-zinc-200">
                  {formatClock(now)}
                </div>
              </div>
              <div
                ref={panelLayoutRef}
                className={`grid min-h-0 flex-1 overflow-hidden ${
                  isResizingPanels ? "cursor-col-resize select-none" : ""
                }`}
                style={{
                  gridTemplateColumns: `minmax(0, ${leftPanelPercent}%) clamp(0.45rem,0.8vw,0.8rem) minmax(0, 1fr)`,
                }}
              >
                <section className="flex min-h-0 min-w-0 overflow-hidden flex-col">
                  <div className="px-1 pb-2 pt-1">
                    <div className="text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
                      Current
                    </div>
                  </div>
                  <StageCurrentCard item={currentItem} aspectRatio={audienceAspectRatio} />
                </section>

                <button
                  type="button"
                  aria-label="Resize stage panels"
                  aria-orientation="vertical"
                  className="group/handle flex h-full w-full touch-none cursor-col-resize items-start justify-center pt-7 focus:outline-none"
                  onPointerDown={handlePanelResizeStart}
                >
                  <span className="block h-full w-px bg-white/12 transition-colors group-hover/handle:bg-white/30 group-focus/handle:bg-white/40" />
                </button>

                <aside className="flex min-h-0 min-w-0 w-full overflow-hidden flex-col">
                  <div className="px-1 pb-2 pt-1">
                    <div className="text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
                      Up next
                    </div>
                  </div>
                  <StageUpNextCard
                    item={nextQueued}
                    etaMinutes={nextQueuedEta}
                    aspectRatio={audienceAspectRatio}
                  />
                </aside>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

function toCssAspectRatio(ratio: ScreenAspectRatio): string {
  const [w, h] = ratio.split(":");
  return `${w} / ${h}`;
}

function labelFor(item: ProgramItem) {
  if (item.itemType === "announcement") return "Announcement";
  if (item.itemType === "speaker") return "Speaker";
  if (item.itemType === "image") return "Image";
  return "Song";
}

function StageCurrentCard({
  item,
  aspectRatio,
}: {
  item: ProgramItem | undefined;
  aspectRatio: ScreenAspectRatio;
}) {
  return (
    <section
      className="min-h-0 w-full overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top,rgba(0,177,255,0.12),transparent_45%),rgba(255,255,255,0.03)] [container-type:inline-size]"
      style={{ aspectRatio: toCssAspectRatio(aspectRatio) }}
    >
      {item ? (
        <StageItemContent item={item} />
      ) : (
        <div className="grid h-full place-items-center p-[clamp(0.75rem,5cqw,2.5rem)] text-center">
          <div>
            <div className="text-[clamp(0.55rem,1.45cqw,0.95rem)] uppercase text-white/40">
              Standby
            </div>
            <div className="mt-[clamp(0.5rem,2cqw,1.25rem)] text-[clamp(1rem,5cqw,4.5rem)] font-semibold leading-tight text-white/70">
              Program starting soon
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function StageUpNextCard({
  item,
  etaMinutes,
  aspectRatio,
}: {
  item: ProgramItem | null;
  etaMinutes: number;
  aspectRatio: ScreenAspectRatio;
}) {
  return (
    <section
      className="w-full overflow-hidden border border-white/10 bg-white/[0.015] [container-type:inline-size]"
      style={{ aspectRatio: toCssAspectRatio(aspectRatio) }}
    >
      {item ? (
        <div className="flex h-full flex-col p-[clamp(0.5rem,4cqw,1.25rem)]">
          <div className="text-[clamp(0.45rem,1.6cqw,0.7rem)] uppercase text-zinc-500">
            {labelFor(item)}
          </div>
          <div className="mt-[clamp(0.35rem,2cqw,0.8rem)] text-[clamp(0.7rem,5.6cqw,1.55rem)] font-semibold leading-tight text-zinc-100">
            {item.title}
          </div>
          <div className="mt-auto space-y-[clamp(0.18rem,1cqw,0.45rem)] pt-[clamp(0.5rem,3cqw,1rem)]">
            <div className="text-[clamp(0.45rem,1.8cqw,0.72rem)] uppercase text-zinc-400">
              Starts in {formatEta(etaMinutes)}
            </div>
            <div className="text-[clamp(0.55rem,2.4cqw,0.95rem)] text-zinc-300">
              {item.duration} min
            </div>
          </div>
        </div>
      ) : (
        <div className="grid h-full place-items-center p-[clamp(0.5rem,4cqw,1.5rem)] text-center text-[clamp(0.55rem,2.6cqw,0.95rem)] text-zinc-500">
          No queued items.
        </div>
      )}
    </section>
  );
}

function StageItemContent({ item }: { item: ProgramItem }) {
  const content = (item.content ?? {}) as ItemContent;
  const labelClass =
    "w-fit rounded-full bg-white/[0.04] px-[clamp(0.4rem,1.7cqw,1rem)] py-[clamp(0.2rem,0.8cqw,0.5rem)] text-[clamp(0.45rem,1.45cqw,0.85rem)] uppercase text-white/55";
  const titleClass =
    "mt-[clamp(0.45rem,1.8cqw,1rem)] text-[clamp(1rem,6.2cqw,5rem)] font-semibold leading-[1.02] text-white";

  if (item.itemType === "image") {
    const image = content as Partial<ImageContent>;
    return (
      <div className="h-full min-w-0 overflow-hidden">
        {image.imageUrl ? (
          <img
            src={image.imageUrl}
            alt={image.alt || item.title}
            className={`h-full w-full ${image.fit === "cover" ? "object-cover" : "object-contain"}`}
          />
        ) : (
          <div className="grid h-full place-items-center text-[clamp(0.65rem,2.2cqw,1.2rem)] text-white/55">
            Image unavailable
          </div>
        )}
      </div>
    );
  }

  if (item.itemType === "speaker") {
    const speaker = content as Partial<SpeakerContent>;
    return (
      <div className="flex h-full min-w-0 flex-col p-[clamp(0.65rem,4cqw,2.5rem)]">
        <div className={labelClass}>{labelFor(item)}</div>
        <h1 className={titleClass}>{item.title}</h1>
        {speaker.speaker && (
          <div className="mt-[clamp(0.45rem,2cqw,1.2rem)] text-[clamp(0.9rem,4.8cqw,3.5rem)] font-semibold leading-tight text-white/95">
            {speaker.speaker}
          </div>
        )}
        {speaker.topic && (
          <div className="mt-[clamp(0.35rem,1.5cqw,0.9rem)] text-[clamp(0.5rem,1.65cqw,1rem)] font-semibold uppercase text-cyan-300/82">
            {speaker.topic}
          </div>
        )}
        {speaker.bio && (
          <p className="mt-[clamp(0.6rem,2.4cqw,1.5rem)] max-w-5xl whitespace-pre-line text-[clamp(0.65rem,2.5cqw,1.75rem)] leading-relaxed text-white/74">
            {speaker.bio}
          </p>
        )}
      </div>
    );
  }

  if (item.itemType === "song") {
    const song = content as Partial<SongContent>;
    return (
      <div className="flex h-full min-w-0 flex-col p-[clamp(0.65rem,4cqw,2.5rem)]">
        <div className={labelClass}>{labelFor(item)}</div>
        <h1 className={titleClass}>{item.title}</h1>
        <div className="mt-[clamp(0.6rem,2.5cqw,1.5rem)] min-h-0 flex-1 overflow-auto bg-black/20 px-[clamp(0.65rem,3.5cqw,2rem)] py-[clamp(0.65rem,3.5cqw,2rem)]">
          <pre className="whitespace-pre-wrap text-center text-[clamp(0.6rem,2.9cqw,2rem)] leading-relaxed text-white/88">
            {song.lyrics?.trim() || "No lyrics yet."}
          </pre>
        </div>
      </div>
    );
  }

  const announcement = content as Partial<AnnouncementContent>;
  return (
    <div className="flex h-full min-w-0 flex-col p-[clamp(0.65rem,4cqw,2.5rem)]">
      <div className={labelClass}>{labelFor(item)}</div>
      <h1 className={titleClass}>{item.title}</h1>
      {announcement.body && (
        <p className="mt-[clamp(0.6rem,2.5cqw,1.5rem)] max-w-5xl whitespace-pre-line text-[clamp(0.65rem,3cqw,2rem)] leading-relaxed text-white/76">
          {announcement.body}
        </p>
      )}
    </div>
  );
}

function formatEta(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatClock(now: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
