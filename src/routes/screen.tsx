import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  subscribeItems,
  subscribePrograms,
  type Program,
  type ProgramItem,
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

  useEffect(() => subscribePrograms(setPrograms), []);

  const active = useMemo(() => programs.find((p) => p.isActive), [programs]);

  useEffect(() => {
    if (!active) {
      setItems([]);
      return;
    }
    return subscribeItems(setItems, active.id);
  }, [active]);

  const live = useMemo(() => items.find((i) => i.status === "live"), [items]);
  const upcoming = useMemo(
    () => items.filter((i) => i.status === "upcoming").slice(0, 2),
    [items],
  );

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        {live ? (
          <>
            <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.4em] text-red-400">
              <span className="inline-block size-2 animate-pulse rounded-full bg-red-500" />
              Live Now
            </div>
            <h1 className="mt-8 text-6xl font-semibold leading-[1.05] tracking-tight sm:text-8xl lg:text-[10rem]">
              {live.title}
            </h1>
            <CountdownTimer item={live} />
          </>
        ) : (
          <>
            <div className="text-xs uppercase tracking-[0.4em] text-white/40">
              Standby
            </div>
            <h1 className="mt-6 text-5xl font-semibold tracking-tight text-white/70 sm:text-7xl">
              {active ? "Program starting soon" : "No active program"}
            </h1>
          </>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="border-t border-white/10 px-8 py-8">
          <div className="mx-auto max-w-5xl">
            <div className="text-xs uppercase tracking-[0.3em] text-white/40">
              Up next
            </div>
            <ul className="mt-4 divide-y divide-white/10">
              {upcoming.map((item, idx) => (
                <li
                  key={item.id}
                  className="flex items-baseline justify-between gap-4 py-3"
                >
                  <div className="flex items-baseline gap-4 min-w-0">
                    <span className="text-sm tabular-nums text-white/40">
                      {idx + 1}
                    </span>
                    <span className="truncate text-2xl font-medium sm:text-3xl">
                      {item.title}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm text-white/40">
                    {item.duration} min
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
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
    <div className={`mt-8 font-mono text-4xl tabular-nums sm:text-5xl ${color}`}>
      {overrun ? "+" : ""}
      {display}
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
