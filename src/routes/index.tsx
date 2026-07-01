import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Live Program Management" },
      { name: "description", content: "Real-time live program management." },
    ],
  }),
  component: Index,
});

const links = [
  { to: "/admin", label: "Admin", desc: "Event coordinator dashboard" },
  { to: "/screen", label: "Screen", desc: "Main event display" },
  { to: "/stage", label: "Stage", desc: "Confidence monitor" },
  { to: "/mobile", label: "Mobile", desc: "Attendee view" },
  { to: "/join", label: "Join", desc: "Open an event by code" },
] as const;

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">
          Live Program Management
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a view to get started.
        </p>
        <div className="mt-8 grid gap-3">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-lg border border-border p-4 transition-colors hover:bg-accent"
            >
              <div className="font-medium">{l.label}</div>
              <div className="text-sm text-muted-foreground">{l.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
