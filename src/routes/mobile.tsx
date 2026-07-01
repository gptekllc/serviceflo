import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  buildDerivedSchedule,
  subscribeItems,
  subscribePresentationOutputs,
  subscribePrograms,
  type AnnouncementContent,
  type ImageContent,
  type ItemType,
  type PresentationOutput,
  type Program,
  type ProgramItem,
  type SongContent,
  type SpeakerContent,
  visibleAnnouncements,
  visibleUpcomingItems,
} from "../lib/programs";

const searchSchema = z.object({
  code: z.string().optional(),
});

export const Route = createFileRoute("/mobile")({
  validateSearch: searchSchema,
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
  image: "Image",
};

type MobileSection = "live" | "schedule" | "announcements";

function MobilePage() {
  const search = useSearch({ from: "/mobile" });
  const [section, setSection] = useState<MobileSection>("live");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [items, setItems] = useState<ProgramItem[]>([]);
  const [outputs, setOutputs] = useState<PresentationOutput[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const requestedCode = search.code?.trim().toUpperCase() ?? "";

  useEffect(() => subscribePrograms(setPrograms), []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const selectedProgram = useMemo(() => {
    if (requestedCode) {
      return programs.find((program) => program.joinCode === requestedCode) ?? null;
    }
    return programs.find((program) => program.isActive) ?? null;
  }, [programs, requestedCode]);

  useEffect(() => {
    if (!selectedProgram) {
      setItems([]);
      setOutputs([]);
      return;
    }
    const unsubItems = subscribeItems(setItems, selectedProgram.id);
    const unsubOutputs = subscribePresentationOutputs(setOutputs, selectedProgram.id);
    return () => {
      unsubItems();
      unsubOutputs();
    };
  }, [selectedProgram]);

  const outputByTarget = useMemo(
    () => new Map(outputs.map((output) => [output.target, output.itemId])),
    [outputs],
  );
  const live = useMemo(
    () =>
      items.find((item) => item.id === outputByTarget.get("audience")) ??
      items.find((item) => item.status === "live"),
    [items, outputByTarget],
  );
  const upcoming = useMemo(() => visibleUpcomingItems(items, now), [items, now]);
  const announcements = useMemo(() => visibleAnnouncements(items, now), [items, now]);
  const schedule = useMemo(() => buildDerivedSchedule(items), [items]);
  const nextItem = upcoming[0];
  const invalidCode = Boolean(requestedCode) && !selectedProgram;

  if (!selectedProgram) {
    return <ProgramAccessEmpty invalidCode={invalidCode} requestedCode={requestedCode} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto max-w-md px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold tracking-tight">
                {selectedProgram.name}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                <span>Code {selectedProgram.joinCode}</span>
                <span className="inline-block size-1 rounded-full bg-muted-foreground/40" />
                <span>{live ? "On air" : "Standby"}</span>
              </div>
            </div>
            <div className="rounded-full border border-border bg-card px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Mobile
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-card p-1">
            {(["live", "schedule", "announcements"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setSection(value)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                  section === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 pb-16 pt-5">
        {section === "live" && (
          <div className="space-y-6">
            <LiveCard item={live} />
            <NowNextPanel live={live} nextItem={nextItem} />
            {announcements.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Announcements
                  </h2>
                  <button
                    onClick={() => setSection("announcements")}
                    className="text-xs text-muted-foreground underline underline-offset-2"
                  >
                    View all
                  </button>
                </div>
                <ul className="mt-4 space-y-3">
                  {announcements.slice(0, 3).map((item) => (
                    <AnnouncementCard key={item.id} item={item} now={now} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {section === "schedule" && (
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Program
              </h2>
              <span className="text-xs text-muted-foreground">
                {schedule.length} item{schedule.length === 1 ? "" : "s"}
              </span>
            </div>
            {schedule.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nothing is scheduled yet.
              </div>
            ) : (
              <ol className="mt-4 space-y-3">
                {schedule.map(({ item, startsAtMinute }, index) => (
                  <ScheduleRow
                    key={item.id}
                    item={item}
                    index={index}
                    startsAtMinute={startsAtMinute}
                    isCurrent={live?.id === item.id}
                  />
                ))}
              </ol>
            )}
          </section>
        )}

        {section === "announcements" && (
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Announcements
              </h2>
              <span className="text-xs text-muted-foreground">{announcements.length}</span>
            </div>

            {announcements.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No announcements yet.
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {announcements.map((item) => (
                  <AnnouncementCard key={item.id} item={item} now={now} />
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function ProgramAccessEmpty({
  invalidCode,
  requestedCode,
}: {
  invalidCode: boolean;
  requestedCode: string;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="rounded-[2rem] border border-border bg-card p-8 text-center shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Join event
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            {invalidCode ? "Code not found" : "Open the right program"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {invalidCode
              ? `No program matches "${requestedCode}". Check the code on the room screen and try again.`
              : "Use the event link or enter the program code from the audience screen."}
          </p>
          <Link
            to="/join"
            className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Enter code
          </Link>
        </div>
      </div>
    </div>
  );
}

function NowNextPanel({
  live,
  nextItem,
}: {
  live: ProgramItem | undefined;
  nextItem: ProgramItem | undefined;
}) {
  return (
    <section className="rounded-[2rem] border border-border bg-card p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Now
          </div>
          <div className="mt-2 text-lg font-semibold text-card-foreground">
            {live?.title ?? "Standby"}
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {live ? labelFor(live) : "Waiting"}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Next
          </div>
          <div className="mt-2 text-lg font-semibold text-card-foreground">
            {nextItem?.title ?? "Nothing queued"}
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {nextItem ? `${labelFor(nextItem)} • ${nextItem.duration} min` : "End of program"}
          </div>
        </div>
      </div>
    </section>
  );
}

function AnnouncementCard({ item, now }: { item: ProgramItem; now: number }) {
  const c = (item.content ?? {}) as Partial<AnnouncementContent>;
  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{TYPE_LABEL.announcement}</span>
          {item.isPinned && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-amber-700">
              pinned
            </span>
          )}
        </div>
        <span>{relativeTime(item.publishedAt ?? item.createdAt, now)}</span>
      </div>
      <div className="mt-1 text-base font-semibold text-card-foreground">{item.title}</div>
      {c.body && (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {c.body}
        </p>
      )}
    </li>
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

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-xl">
      <div className="flex items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em]">
          <span className="inline-block size-2 animate-pulse rounded-full bg-primary-foreground" />
          Happening Now
        </div>
        <span className="rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide">
          {labelFor(item)}
        </span>
      </div>

      <div className="px-6 pb-6 pt-4">
        {item.itemType === "speaker" ? (
          <SpeakerBody item={item} />
        ) : item.itemType === "song" ? (
          <SongBody item={item} />
        ) : item.itemType === "image" ? (
          <ImageBody item={item} />
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
      <h1 className="text-3xl font-semibold leading-tight tracking-tight">{item.title}</h1>
      {c.body && (
        <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-primary-foreground/85">
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
      <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">{name}</h1>
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
      <h1 className="text-3xl font-semibold leading-tight tracking-tight">{item.title}</h1>
      {lines.length === 0 ? (
        <p className="mt-4 text-sm text-primary-foreground/70">No lyrics yet.</p>
      ) : (
        <div className="mt-5 max-h-80 overflow-auto rounded-2xl bg-primary-foreground/10 px-5 py-5">
          {lines.map((line, i) => (
            <p key={i} className={`text-center text-lg leading-snug ${line.trim() ? "" : "h-4"}`}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleRow({
  item,
  index,
  startsAtMinute,
  isCurrent,
}: {
  item: ProgramItem;
  index: number;
  startsAtMinute: number;
  isCurrent: boolean;
}) {
  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
              {labelFor(item)}
            </span>
            {isCurrent && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">live</span>
            )}
          </div>
          <div className="mt-2 truncate text-base font-semibold text-card-foreground">
            {item.title}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm font-semibold text-card-foreground">
            +{formatMinutes(startsAtMinute)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{item.duration} min</div>
        </div>
      </div>
    </li>
  );
}

function ImageBody({ item }: { item: ProgramItem }) {
  const c = (item.content ?? {}) as Partial<ImageContent>;
  return (
    <div>
      <h1 className="text-3xl font-semibold leading-tight tracking-tight">{item.title}</h1>
      {c.imageUrl ? (
        <img
          src={c.imageUrl}
          alt={c.alt || item.title}
          className="mt-5 max-h-80 w-full rounded-2xl bg-primary-foreground/10 object-contain"
        />
      ) : (
        <p className="mt-4 text-sm text-primary-foreground/70">Image unavailable.</p>
      )}
    </div>
  );
}

function labelFor(item: ProgramItem) {
  return TYPE_LABEL[item.itemType ?? "announcement"];
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

function formatMinutes(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
