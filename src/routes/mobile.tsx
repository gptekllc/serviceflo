import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import {
  subscribeItems,
  type AnnouncementContent,
  type ItemType,
  type ProgramItem,
  type SongContent,
  type SpeakerContent,
} from "../lib/programs";

export const Route = createFileRoute("/mobile")({
  head: () => ({
    meta: [
      { title: "Attendee — Live Program" },
      { name: "description", content: "Live program attendee view." },
    ],
  }),
  component: MobilePage,
});

const TYPE_LABEL: Record<ItemType, string> = {
  announcement: "Announcement",
  speaker: "Speaker",
  song: "Song",
};

function MobilePage() {
  useAnonymousAuth();
  const [items, setItems] = useState<ProgramItem[]>([]);

  useEffect(() => subscribeItems(setItems), []);

  const live = useMemo(() => items.find((i) => i.status === "live"), [items]);
  const upcoming = useMemo(
    () => items.filter((i) => i.status === "upcoming"),
    [items],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3">
          <div className="text-sm font-semibold tracking-tight">Live Program</div>
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            <span
              className={`inline-block size-2 rounded-full ${live ? "animate-pulse bg-destructive" : "bg-muted-foreground/40"}`}
            />
            {live ? "On Air" : "Standby"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 pb-16 pt-5">
        <LiveCard item={live} />

        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Up Next
            </h2>
            <span className="text-xs text-muted-foreground">
              {upcoming.length} item{upcoming.length === 1 ? "" : "s"}
            </span>
          </div>

          {upcoming.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              That's everything for now.
            </div>
          ) : (
            <ol className="mt-4 space-y-3">
              {upcoming.map((item, idx) => (
                <TimelineRow key={item.id} item={item} index={idx} />
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}

function LiveCard({ item }: { item: ProgramItem | undefined }) {
  if (!item) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Standby
        </div>
        <div className="mt-3 text-xl font-semibold text-card-foreground">
          The program will begin soon.
        </div>
      </div>
    );
  }

  const type = item.itemType ?? "announcement";
  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-xl">
      <div className="flex items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em]">
          <span className="inline-block size-2 animate-pulse rounded-full bg-primary-foreground" />
          Happening Now
        </div>
        <span className="rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide">
          {TYPE_LABEL[type]}
        </span>
      </div>

      <div className="px-6 pb-6 pt-4">
        {type === "speaker" ? (
          <SpeakerBody item={item} />
        ) : type === "song" ? (
          <SongBody item={item} />
        ) : (
          <AnnouncementBody item={item} />
        )}
      </div>
    </article>
  );
}

function AnnouncementBody({ item }: { item: ProgramItem }) {
  const c = (item.content ?? {}) as Partial<AnnouncementContent>;
  return (
    <div>
      <h1 className="text-3xl font-semibold leading-tight tracking-tight">
        {item.title}
      </h1>
      {c.body && (
        <p className="mt-4 text-base leading-relaxed text-primary-foreground/85">
          {c.body}
        </p>
      )}
    </div>
  );
}

function SpeakerBody({ item }: { item: ProgramItem }) {
  const c = (item.content ?? {}) as Partial<SpeakerContent>;
  const name = c.speaker || item.title;
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div>
      {c.topic && (
        <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-primary-foreground/70">
          {c.topic}
        </div>
      )}
      <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
        {name}
      </h1>
      <div className="mt-5 flex items-start gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-foreground/15 text-sm font-semibold">
          {initials || "•"}
        </div>
        {c.bio && (
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-primary-foreground/85">
            {c.bio}
          </p>
        )}
      </div>
    </div>
  );
}

function SongBody({ item }: { item: ProgramItem }) {
  const c = (item.content ?? {}) as Partial<SongContent>;
  const lyrics = (c.lyrics ?? "").trim();
  const lines = lyrics ? lyrics.split(/\n/) : [];

  return (
    <div>
      <h1 className="text-3xl font-semibold leading-tight tracking-tight">
        {item.title}
      </h1>
      {lines.length === 0 ? (
        <p className="mt-4 text-sm text-primary-foreground/70">No lyrics yet.</p>
      ) : (
        <div
          className="relative mt-5 h-64 overflow-hidden rounded-2xl bg-primary-foreground/10"
          style={{
            maskImage:
              "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
          }}
        >
          <div
            className="space-y-2 px-5 will-change-transform motion-safe:animate-[lyrics-scroll_28s_linear_infinite]"
            style={{ paddingTop: "100%" }}
          >
            {[...lines, ...lines].map((line, i) => (
              <p
                key={i}
                className={`text-center text-lg leading-snug ${line.trim() ? "" : "h-4"}`}
              >
                {line}
              </p>
            ))}
          </div>
          <style>{`@keyframes lyrics-scroll { from { transform: translateY(0); } to { transform: translateY(-50%); } }`}</style>
        </div>
      )}
    </div>
  );
}

function TimelineRow({ item, index }: { item: ProgramItem; index: number }) {
  const type = item.itemType ?? "announcement";
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
      <div className="flex flex-col items-center pt-1">
        <div className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-card text-[11px] font-semibold tabular-nums text-muted-foreground">
          {index + 1}
        </div>
      </div>
      <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
            {TYPE_LABEL[type]}
          </span>
          <span>{item.duration} min</span>
        </div>
        <div className="mt-1.5 truncate text-base font-semibold text-card-foreground">
          {item.title}
        </div>
      </div>
    </li>
  );
}
