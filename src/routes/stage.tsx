import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  subscribeItems,
  subscribePresentationOutputs,
  subscribePrograms,
  type AnnouncementContent,
  type PresentationOutput,
  type Program,
  type ProgramItem,
  type ScreenAspectRatio,
  type SongContent,
  type SpeakerContent,
} from "../lib/programs";

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
  const [now, setNow] = useState(() => Date.now());
  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => subscribePrograms(setPrograms), []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
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
  const stageOutput = useMemo(
    () => outputs.find((output) => output.target === "stage") ?? null,
    [outputs],
  );
  const queue = useMemo(() => {
    if (!stageItem) return items.slice(0, 3);
    return items
      .filter((item) => item.orderIndex > stageItem.orderIndex)
      .slice(0, 3);
  }, [items, stageItem]);
  const aspectRatio = active?.stageAspectRatio ?? "16:9";

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

  return (
    <div className="group relative min-h-screen bg-zinc-950 p-3 text-zinc-50">
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
        className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[2200px] items-center justify-center bg-zinc-950"
      >
        <div
          onDoubleClick={() => {
            void toggleFullscreen();
          }}
          className="w-full max-h-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
          style={{ aspectRatio: toCssAspectRatio(aspectRatio) }}
        >
          <div className="mx-auto h-full max-w-[1800px] p-[clamp(0.75rem,1.8vw,2.5rem)]">
        <main className="flex min-h-0 flex-col rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(0,255,196,0.12),transparent_40%),rgba(255,255,255,0.03)] p-[clamp(1rem,1.8vw,2rem)] shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/80">
                Stage View
              </div>
              <div className="mt-2 text-sm text-zinc-400">
                {active?.name ?? "No active program"}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[clamp(1.35rem,2.3vw,2rem)] tabular-nums text-zinc-200">
                {formatClock(now)}
              </div>
            </div>
          </div>

          <div className="mt-[clamp(0.75rem,1.5vw,2rem)] grid min-h-0 flex-1 gap-[clamp(0.75rem,1.4vw,1.5rem)] xl:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)]">
            <section className="flex min-h-0 flex-col rounded-[1.75rem] border border-white/10 bg-black/20 p-[clamp(0.85rem,1.6vw,1.75rem)]">
              {stageItem ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
                      Current on stage
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.26em] text-zinc-400">
                      {labelFor(stageItem)}
                    </div>
                  </div>
                  <div className="mt-4 text-[clamp(1.85rem,4.6vw,4.5rem)] font-semibold leading-[1.04] tracking-tight">
                    {stageItem.title}
                  </div>
                  <div className="mt-4 flex items-center gap-3 text-sm uppercase tracking-[0.24em] text-zinc-500">
                    <span>{stageItem.duration} min</span>
                    {stageOutput && (
                      <span>Routed {relativeTime(stageOutput.updatedAt, now)}</span>
                    )}
                  </div>
                  <div className="mt-[clamp(0.75rem,1.4vw,1.75rem)] min-h-0 flex-1 overflow-hidden">
                    <StageDetail item={stageItem} />
                  </div>
                </>
              ) : (
                <div className="grid flex-1 place-items-center">
                  <div className="text-center">
                    <div className="text-xs uppercase tracking-[0.4em] text-zinc-500">
                      Standby
                    </div>
                    <div className="mt-4 text-[clamp(1.65rem,4vw,3rem)] font-semibold tracking-tight text-zinc-300">
                      Nothing routed to stage
                    </div>
                  </div>
                </div>
              )}
            </section>

            <div className="flex min-h-0 flex-col">
              <section className="flex min-h-0 flex-1 flex-col rounded-[1.75rem] border border-white/10 bg-black/20 p-[clamp(0.75rem,1.3vw,1.25rem)]">
                <div className="text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
                  Up next
                </div>
                {queue.length === 0 ? (
                  <div className="mt-6 flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-zinc-500">
                    No queued items.
                  </div>
                ) : (
                  <ul className="mt-5 space-y-3 overflow-auto pr-1">
                    {queue.map((item, index) => (
                      <li
                        key={item.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.22em] text-zinc-500">
                          <span>{index + 1}</span>
                          <span>{labelFor(item)}</span>
                        </div>
                        <div className="mt-2 text-[clamp(1rem,1.9vw,1.25rem)] font-medium leading-tight text-zinc-100">
                          {item.title}
                        </div>
                        <div className="mt-2 text-sm text-zinc-500">{item.duration} min</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
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

function StageDetail({ item }: { item: ProgramItem }) {
  if (item.itemType === "speaker") {
    const content = (item.content ?? {}) as Partial<SpeakerContent>;
    return (
      <div className="space-y-4">
        {content.topic && (
          <div className="text-xl uppercase tracking-[0.28em] text-cyan-300/80">
            {content.topic}
          </div>
        )}
        {content.speaker && (
          <div className="text-[clamp(1.2rem,2.8vw,1.85rem)] font-medium text-zinc-200">{content.speaker}</div>
        )}
        {content.bio && (
          <p className="max-w-4xl whitespace-pre-line text-[clamp(0.95rem,2vw,1.3rem)] leading-relaxed text-zinc-400">
            {content.bio}
          </p>
        )}
      </div>
    );
  }

  if (item.itemType === "song") {
    const content = (item.content ?? {}) as Partial<SongContent>;
    return (
      <pre className="max-h-full overflow-auto whitespace-pre-wrap text-[clamp(0.95rem,2.4vw,1.6rem)] leading-relaxed text-zinc-300">
        {content.lyrics?.trim() || "No lyrics yet."}
      </pre>
    );
  }

  const content = (item.content ?? {}) as Partial<AnnouncementContent>;
  return (
    <p className="max-w-4xl whitespace-pre-line text-[clamp(0.95rem,2.4vw,1.6rem)] leading-relaxed text-zinc-300">
      {content.body?.trim() || "No additional detail."}
    </p>
  );
}

function labelFor(item: ProgramItem) {
  if (item.itemType === "announcement") return "Announcement";
  if (item.itemType === "speaker") return "Speaker";
  return "Song";
}

function formatClock(now: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

function relativeTime(iso: string, now: number) {
  const diff = now - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

