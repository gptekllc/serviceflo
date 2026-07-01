import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  subscribePresentationOutputs,
  subscribeItems,
  subscribePrograms,
  type AnnouncementContent,
  type PresentationOutput,
  type Program,
  type ProgramItem,
  type ScreenAspectRatio,
  type SongContent,
  type SpeakerContent,
  visibleAnnouncements,
  visibleUpcomingItems,
} from "../lib/programs";

export const Route = createFileRoute("/screen")({
  head: () => ({
    meta: [
      { title: "Screen — Live Program" },
      { name: "description", content: "Live program presentation view." },
    ],
  }),
  component: ScreenPage,
});

function ScreenPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [items, setItems] = useState<ProgramItem[]>([]);
  const [outputs, setOutputs] = useState<PresentationOutput[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const screenHostRef = useRef<HTMLDivElement | null>(null);
  const screenFrameRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => subscribePrograms(setPrograms), []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const active = useMemo(() => programs.find((p) => p.isActive), [programs]);

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

  const audienceItemId = useMemo(
    () => outputs.find((output) => output.target === "audience")?.itemId ?? null,
    [outputs],
  );
  const live = useMemo(
    () =>
      items.find((item) => item.id === audienceItemId) ??
      items.find((item) => item.status === "live"),
    [items, audienceItemId],
  );
  const upcoming = useMemo(
    () => visibleUpcomingItems(items, now).slice(0, 2),
    [items, now],
  );
  const announcements = useMemo(
    () => visibleAnnouncements(items, now).slice(0, 4),
    [items, now],
  );
  const aspectRatio = active?.audienceAspectRatio ?? "16:9";
  const mobileUrl = useMemo(() => {
    if (!active) return null;
    const path = `/mobile?code=${encodeURIComponent(active.joinCode)}`;
    if (typeof window === "undefined") return path;
    return new URL(path, window.location.origin).toString();
  }, [active]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === screenHostRef.current);
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
    await screenHostRef.current?.requestFullscreen();
  };

  return (
    <div className="group relative min-h-screen bg-[#05070b] p-3 text-white">
      <button
        type="button"
        onClick={() => {
          void toggleFullscreen();
        }}
        className="pointer-events-none absolute right-6 top-6 z-20 rounded-md border border-white/20 bg-black/55 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus:pointer-events-auto focus:opacity-100"
      >
        {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      </button>
      <div
        ref={screenHostRef}
        className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[2200px] items-center justify-center bg-[#05070b]"
      >
        <div
          ref={screenFrameRef}
          onDoubleClick={() => {
            void toggleFullscreen();
          }}
          className="w-full max-h-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
          style={{ aspectRatio: toCssAspectRatio(aspectRatio) }}
        >
          <div className="mx-auto flex h-full min-h-0 max-w-[1800px] flex-col px-[clamp(0.75rem,1.6vw,2rem)] py-[clamp(0.75rem,1.6vw,2rem)]">
        <header className="flex items-center justify-between gap-6 border-b border-white/10 pb-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/85">
              Audience Screen
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">
              {active?.name ?? "Live Program"}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-4xl tabular-nums text-white/90">
              {formatClock(now)}
            </div>
            {active && (
              <div className="mt-2 text-xs uppercase tracking-[0.26em] text-white/45">
                Join code {active.joinCode}
              </div>
            )}
          </div>
        </header>

        <div className="mt-[clamp(0.75rem,1.5vw,2rem)] grid min-h-0 flex-1 gap-[clamp(0.75rem,1.5vw,2rem)] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <main className="flex min-h-0 flex-col rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(0,177,255,0.12),transparent_45%),rgba(255,255,255,0.03)] p-[clamp(0.85rem,1.7vw,2.5rem)] shadow-2xl">
            {live ? (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.34em] text-red-400">
                    <span className="inline-block size-2 animate-pulse rounded-full bg-red-500" />
                    Live Now
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.25em] text-white/55">
                    {labelFor(live)}
                  </div>
                </div>

                <div className="mt-[clamp(0.75rem,1.4vw,2rem)] min-h-0 flex flex-1 flex-col overflow-auto">
                  <LiveBody item={live} />
                </div>

                <div className="mt-[clamp(0.75rem,1.4vw,2rem)] flex items-center justify-between gap-6 border-t border-white/10 pt-[clamp(0.65rem,1.3vw,1.5rem)]">
                  <CountdownTimer item={live} />
                  {upcoming[0] && (
                    <div className="max-w-[36rem] text-right">
                      <div className="text-xs uppercase tracking-[0.28em] text-white/40">
                        Up next
                      </div>
                      <div className="mt-2 text-2xl font-medium text-white/90">
                        {upcoming[0].title}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-center">
                <div>
                  <div className="text-xs uppercase tracking-[0.4em] text-white/40">
                    Standby
                  </div>
                  <h1 className="mt-6 text-5xl font-semibold tracking-tight text-white/70 sm:text-7xl">
                    {active ? "Program starting soon" : "No active program"}
                  </h1>
                </div>
              </div>
            )}
          </main>

          <aside className="flex min-h-0 flex-col gap-[clamp(0.75rem,1.4vw,1.5rem)] overflow-hidden">
            {mobileUrl && active && (
              <section className="shrink-0 rounded-[2rem] border border-white/10 bg-white/[0.04] p-[clamp(0.75rem,1.3vw,1.5rem)] shadow-2xl">
                <div className="text-xs uppercase tracking-[0.3em] text-white/40">
                  Follow Along
                </div>
                <div className="mt-4 grid place-items-center rounded-2xl bg-white p-4">
                  <QRCodeSVG value={mobileUrl} size={220} level="M" includeMargin />
                </div>
                <div className="mt-5 text-center">
                  <div className="text-sm text-white/65">Open on phone</div>
                  <div className="mt-2 font-mono text-2xl font-semibold tracking-[0.18em] text-cyan-300">
                    {active.joinCode}
                  </div>
                </div>
              </section>
            )}

            {announcements.length > 0 && (
              <section className="flex min-h-0 flex-1 flex-col rounded-[2rem] border border-white/10 bg-white/[0.04] p-[clamp(0.75rem,1.3vw,1.5rem)] shadow-2xl">
                <div className="text-xs uppercase tracking-[0.3em] text-white/40">
                  Announcements
                </div>
                <ul className="mt-5 flex-1 space-y-4 overflow-auto pr-1">
                  {announcements.map((item) => (
                    <AnnouncementRailCard key={item.id} item={item} now={now} />
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
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

function AnnouncementRailCard({
  item,
  now,
}: {
  item: ProgramItem;
  now: number;
}) {
  const c = (item.content ?? {}) as Partial<AnnouncementContent>;

  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left">
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.25em] text-white/45">
        <div className="flex items-center gap-2">
          <span>Announcement</span>
          {item.isPinned && (
            <span className="rounded-full bg-amber-400/15 px-2 py-1 tracking-[0.18em] text-amber-300">
              Pinned
            </span>
          )}
        </div>
        <span>{relativeTime(item.publishedAt ?? item.createdAt, now)}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold leading-tight text-white">
        {item.title}
      </div>
      {c.body && (
        <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-white/72">
          {c.body}
        </p>
      )}
    </li>
  );
}

function CountdownTimer({ item }: { item: ProgramItem }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!item.liveStartedAt || item.duration <= 0) {
    return (
      <div className="mt-8 text-lg text-white/50 sm:text-xl">
        {item.duration} minutes
      </div>
    );
  }

  const startedAt = new Date(item.liveStartedAt).getTime();
  const totalMs = item.duration * 60_000;
  const remainingMs = Math.max(0, startedAt + totalMs - now);
  const elapsedMs = now - startedAt;
  const overrun = startedAt + totalMs < now;

  const display = formatMs(overrun ? elapsedMs - totalMs : remainingMs);
  const color = overrun ? "text-red-400" : remainingMs < 60_000 ? "text-amber-300" : "text-white/60";

  return (
    <div className={`font-mono text-4xl tabular-nums sm:text-5xl ${color}`}>
      {overrun ? "+" : ""}
      {display}
    </div>
  );
}

function LiveBody({ item }: { item: ProgramItem }) {
  if (item.itemType === "speaker") {
    const content = (item.content ?? {}) as Partial<SpeakerContent>;
    return (
      <div className="flex h-full flex-col">
        {content.topic && (
          <div className="text-lg font-semibold uppercase tracking-[0.28em] text-cyan-300/82">
            {content.topic}
          </div>
        )}
        <h1 className="mt-5 text-6xl font-semibold leading-[1.02] tracking-tight lg:text-8xl">
          {content.speaker || item.title}
        </h1>
        {content.bio && (
          <p className="mt-8 max-w-5xl whitespace-pre-line text-3xl leading-relaxed text-white/74">
            {content.bio}
          </p>
        )}
      </div>
    );
  }

  if (item.itemType === "song") {
    const content = (item.content ?? {}) as Partial<SongContent>;
    return (
      <div className="flex h-full flex-col">
        <h1 className="text-6xl font-semibold leading-[1.02] tracking-tight lg:text-8xl">
          {item.title}
        </h1>
        <div className="mt-8 max-h-[46rem] overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 px-8 py-8">
          <pre className="whitespace-pre-wrap text-center text-3xl leading-relaxed text-white/88">
            {content.lyrics?.trim() || "No lyrics yet."}
          </pre>
        </div>
      </div>
    );
  }

  const content = (item.content ?? {}) as Partial<AnnouncementContent>;
  return (
    <div className="flex h-full flex-col">
      <h1 className="text-6xl font-semibold leading-[1.02] tracking-tight lg:text-8xl">
        {item.title}
      </h1>
      {content.body && (
        <p className="mt-8 max-w-5xl whitespace-pre-line text-3xl leading-relaxed text-white/76">
          {content.body}
        </p>
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function relativeTime(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatClock(now: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

function labelFor(item: ProgramItem) {
  if (item.itemType === "announcement") return "Announcement";
  if (item.itemType === "speaker") return "Speaker";
  return "Song";
}
