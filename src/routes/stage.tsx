import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  const audienceOutput = useMemo(
    () => outputs.find((output) => output.target === "audience") ?? null,
    [outputs],
  );
  const audienceItem = useMemo(
    () =>
      items.find((item) => item.id === outputByTarget.get("audience")) ??
      items.find((item) => item.status === "live"),
    [items, outputByTarget],
  );
  const queue = useMemo(() => {
    if (!stageItem) return items.slice(0, 3);
    return items
      .filter((item) => item.orderIndex > stageItem.orderIndex)
      .slice(0, 3);
  }, [items, stageItem]);
  const aspectRatio = active?.stageAspectRatio ?? "16:9";

  return (
    <div className="min-h-screen bg-zinc-950 p-3 text-zinc-50">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[2200px] items-center justify-center">
        <div
          className="w-full max-h-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
          style={{ aspectRatio: toCssAspectRatio(aspectRatio) }}
        >
          <div className="mx-auto grid h-full max-w-[1800px] gap-8 px-8 py-10 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <main className="flex min-h-[70vh] flex-col rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(0,255,196,0.12),transparent_40%),rgba(255,255,255,0.03)] p-8 shadow-2xl">
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
              <div className="font-mono text-3xl tabular-nums text-zinc-200">
                {formatClock(now)}
              </div>
              {audienceItem && (
                <div className="mt-1 text-xs uppercase tracking-[0.28em] text-zinc-500">
                  Audience: {audienceItem.title}
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="flex min-h-[50vh] flex-col rounded-[1.75rem] border border-white/10 bg-black/20 p-7">
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
                  <div className="mt-4 text-5xl font-semibold leading-[1.04] tracking-tight lg:text-7xl">
                    {stageItem.title}
                  </div>
                  <div className="mt-4 flex items-center gap-3 text-sm uppercase tracking-[0.24em] text-zinc-500">
                    <span>{stageItem.duration} min</span>
                    {stageOutput && (
                      <span>Routed {relativeTime(stageOutput.updatedAt, now)}</span>
                    )}
                  </div>
                  <div className="mt-7 min-h-0 flex-1 overflow-hidden">
                    <StageDetail item={stageItem} />
                  </div>
                </>
              ) : (
                <div className="grid flex-1 place-items-center">
                  <div className="text-center">
                    <div className="text-xs uppercase tracking-[0.4em] text-zinc-500">
                      Standby
                    </div>
                    <div className="mt-4 text-5xl font-semibold tracking-tight text-zinc-300">
                      Nothing routed to stage
                    </div>
                  </div>
                </div>
              )}
            </section>

            <div className="flex flex-col gap-6">
              <section className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
                  Audience live
                </div>
                {audienceItem ? (
                  <>
                    <div className="mt-3 text-2xl font-medium leading-tight text-zinc-100">
                      {audienceItem.title}
                    </div>
                    <div className="mt-2 text-sm uppercase tracking-[0.22em] text-zinc-500">
                      {labelFor(audienceItem)}
                    </div>
                    <div className="mt-5">
                      <AudienceTimer
                        item={audienceItem}
                        updatedAt={audienceOutput?.updatedAt ?? null}
                        now={now}
                      />
                    </div>
                  </>
                ) : (
                  <div className="mt-4 text-sm text-zinc-500">Audience screen is clear.</div>
                )}
              </section>

              <section className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.32em] text-zinc-500">
                  Up next
                </div>
                {queue.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-zinc-500">
                    No queued items.
                  </div>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {queue.map((item, index) => (
                      <li
                        key={item.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.22em] text-zinc-500">
                          <span>{index + 1}</span>
                          <span>{labelFor(item)}</span>
                        </div>
                        <div className="mt-2 text-xl font-medium leading-tight text-zinc-100">
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
          <div className="text-3xl font-medium text-zinc-200">{content.speaker}</div>
        )}
        {content.bio && (
          <p className="max-w-4xl whitespace-pre-line text-xl leading-relaxed text-zinc-400">
            {content.bio}
          </p>
        )}
      </div>
    );
  }

  if (item.itemType === "song") {
    const content = (item.content ?? {}) as Partial<SongContent>;
    return (
      <pre className="max-h-full overflow-auto whitespace-pre-wrap text-2xl leading-relaxed text-zinc-300">
        {content.lyrics?.trim() || "No lyrics yet."}
      </pre>
    );
  }

  const content = (item.content ?? {}) as Partial<AnnouncementContent>;
  return (
    <p className="max-w-4xl whitespace-pre-line text-2xl leading-relaxed text-zinc-300">
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

function AudienceTimer({
  item,
  updatedAt,
  now,
}: {
  item: ProgramItem;
  updatedAt: string | null;
  now: number;
}) {
  const startedAt = item.liveStartedAt ?? updatedAt;
  if (!startedAt) {
    return <div className="font-mono text-4xl tabular-nums text-zinc-300">--:--</div>;
  }

  const base = new Date(startedAt).getTime();
  const totalMs = item.duration * 60_000;
  const elapsed = now - base;
  const remaining = Math.max(0, totalMs - elapsed);
  const overrun = totalMs > 0 && elapsed > totalMs;
  const display = formatDuration(overrun ? elapsed - totalMs : remaining);

  return (
    <div className={`font-mono text-4xl tabular-nums ${overrun ? "text-rose-400" : "text-zinc-200"}`}>
      {overrun ? "+" : ""}
      {display}
    </div>
  );
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

function formatDuration(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
