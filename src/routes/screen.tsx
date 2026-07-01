import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
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
} from "../lib/programs";

export const Route = createFileRoute("/screen")({
  validateSearch: z.object({
    embed: z.number().optional(),
  }),
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
  const screenHostRef = useRef<HTMLDivElement | null>(null);
  const screenFrameRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { embed } = Route.useSearch();
  const isEmbedded = embed === 1;

  useEffect(() => subscribePrograms(setPrograms), []);

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
  const aspectRatio = active?.audienceAspectRatio ?? "16:9";

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
    <div
      className={
        isEmbedded
          ? "min-h-screen bg-[#05070b] text-white"
          : "group relative min-h-screen bg-[#05070b] p-3 text-white"
      }
    >
      {!isEmbedded && (
        <button
          type="button"
          onClick={() => {
            void toggleFullscreen();
          }}
          className="pointer-events-none absolute right-6 top-6 z-20 rounded-md border border-white/20 bg-black/55 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus:pointer-events-auto focus:opacity-100"
        >
          {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      )}
      <div
        ref={screenHostRef}
        className={
          isEmbedded
            ? "flex min-h-screen w-full items-center justify-center bg-[#05070b]"
            : "mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[2200px] items-center justify-center bg-[#05070b]"
        }
      >
        <div
          ref={screenFrameRef}
          onDoubleClick={() => {
            void toggleFullscreen();
          }}
          className={
            isEmbedded
              ? "h-full w-full overflow-hidden"
              : "w-full max-h-full overflow-hidden border border-white/10 shadow-2xl"
          }
          style={{ aspectRatio: toCssAspectRatio(aspectRatio) }}
        >
          <div
            className={
              isEmbedded
                ? "flex h-full min-h-0 w-full flex-col"
                : "mx-auto flex h-full min-h-0 max-w-[1800px] flex-col px-[clamp(0.75rem,1.6vw,2rem)] py-[clamp(0.75rem,1.6vw,2rem)]"
            }
          >
            <div className="grid min-h-0 flex-1 gap-[clamp(0.75rem,1.5vw,2rem)]">
              <main
                className={
                  isEmbedded
                    ? "flex min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(0,177,255,0.12),transparent_45%),rgba(255,255,255,0.03)] p-[clamp(0.85rem,1.7vw,2.5rem)]"
                    : "flex min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(0,177,255,0.12),transparent_45%),rgba(255,255,255,0.03)] p-[clamp(0.85rem,1.7vw,2.5rem)] shadow-2xl"
                }
              >
                {live ? (
                  <div className="min-h-0 flex flex-1 flex-col overflow-auto">
                    <LiveBody item={live} embedded={isEmbedded} />
                  </div>
                ) : (
                  <div className="grid flex-1 place-items-center text-center">
                    <div>
                      <div className="text-xs uppercase tracking-[0.4em] text-white/40">
                        Standby
                      </div>
                      <h1
                        className={
                          isEmbedded
                            ? "mt-4 text-[clamp(1.35rem,5vw,2.8rem)] font-semibold tracking-tight text-white/70"
                            : "mt-6 text-5xl font-semibold tracking-tight text-white/70 sm:text-7xl"
                        }
                      >
                        {active ? "Program starting soon" : "No active program"}
                      </h1>
                    </div>
                  </div>
                )}
              </main>
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

function LiveBody({ item, embedded = false }: { item: ProgramItem; embedded?: boolean }) {
  const badgeClass = embedded
    ? "w-fit rounded-full bg-white/[0.04] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55"
    : "w-fit rounded-full bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.25em] text-white/55";

  if (item.itemType === "speaker") {
    const content = (item.content ?? {}) as Partial<SpeakerContent>;
    return (
      <div className="flex h-full flex-col">
        <div className={badgeClass}>{labelFor(item)}</div>
        <h1
          className={
            embedded
              ? "mt-3 text-[clamp(1.35rem,4vw,2.8rem)] font-semibold leading-[1.02] tracking-tight"
              : "mt-4 text-5xl font-semibold leading-[1.02] tracking-tight lg:text-7xl"
          }
        >
          {item.title}
        </h1>
        <div
          className={
            embedded
              ? "mt-3 text-[clamp(1.1rem,3.4vw,2.2rem)] font-semibold leading-tight text-white/95"
              : "mt-5 text-4xl font-semibold leading-tight text-white/95 lg:text-6xl"
          }
        >
          {content.speaker || ""}
        </div>
        {content.topic && (
          <div
            className={
              embedded
                ? "mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/82"
                : "mt-4 text-lg font-semibold uppercase tracking-[0.28em] text-cyan-300/82"
            }
          >
            {content.topic}
          </div>
        )}
        {content.bio && (
          <p
            className={
              embedded
                ? "mt-4 max-w-5xl whitespace-pre-line text-[clamp(0.9rem,2.1vw,1.35rem)] leading-relaxed text-white/74"
                : "mt-6 max-w-5xl whitespace-pre-line text-3xl leading-relaxed text-white/74"
            }
          >
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
        <div className={badgeClass}>{labelFor(item)}</div>
        <h1
          className={
            embedded
              ? "mt-3 text-[clamp(1.45rem,4.3vw,2.9rem)] font-semibold leading-[1.02] tracking-tight"
              : "mt-4 text-6xl font-semibold leading-[1.02] tracking-tight lg:text-8xl"
          }
        >
          {item.title}
        </h1>
        <div
          className={
            embedded
              ? "mt-4 min-h-0 flex-1 overflow-auto bg-black/20 px-4 py-4"
              : "mt-6 min-h-0 flex-1 overflow-auto rounded-[2rem] bg-black/20 px-8 py-8"
          }
        >
          <pre
            className={
              embedded
                ? "whitespace-pre-wrap text-center text-[clamp(0.85rem,2vw,1.35rem)] leading-relaxed text-white/88"
                : "whitespace-pre-wrap text-center text-3xl leading-relaxed text-white/88"
            }
          >
            {content.lyrics?.trim() || "No lyrics yet."}
          </pre>
        </div>
      </div>
    );
  }

  const content = (item.content ?? {}) as Partial<AnnouncementContent>;
  return (
    <div className="flex h-full flex-col">
      <div className={badgeClass}>{labelFor(item)}</div>
      <h1
        className={
          embedded
            ? "mt-3 text-[clamp(1.45rem,4.2vw,2.9rem)] font-semibold leading-[1.02] tracking-tight"
            : "mt-4 text-6xl font-semibold leading-[1.02] tracking-tight lg:text-8xl"
        }
      >
        {item.title}
      </h1>
      {content.body && (
        <p
          className={
            embedded
              ? "mt-4 max-w-5xl whitespace-pre-line text-[clamp(0.9rem,2.2vw,1.4rem)] leading-relaxed text-white/76"
              : "mt-6 max-w-5xl whitespace-pre-line text-3xl leading-relaxed text-white/76"
          }
        >
          {content.body}
        </p>
      )}
    </div>
  );
}

function labelFor(item: ProgramItem) {
  if (item.itemType === "announcement") return "Announcement";
  if (item.itemType === "speaker") return "Speaker";
  return "Song";
}
