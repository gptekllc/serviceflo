import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type ItemStatus = "upcoming" | "live" | "completed";
export type ItemType = "announcement" | "speaker" | "song";

export interface AnnouncementContent {
  body: string;
}
export interface SpeakerContent {
  speaker: string;
  topic: string;
  bio: string;
}
export interface SongContent {
  lyrics: string;
}
export type ItemContent =
  | AnnouncementContent
  | SpeakerContent
  | SongContent
  | Record<string, never>;

export interface ProgramItem {
  id: string;
  programId: string;
  title: string;
  orderIndex: number;
  duration: number;
  status: ItemStatus;
  itemType: ItemType;
  content: ItemContent;
  liveStartedAt: string | null;
  publishedAt: string | null;
  isPinned: boolean;
  priority: number;
  createdAt: string;
}

export interface Program {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

type Row = {
  id: string;
  title: string;
  order_index: number;
  duration: number;
  status: ItemStatus;
  item_type: ItemType;
  content: Json | null;
  program_id: string;
  live_started_at: string | null;
  published_at: string | null;
  is_pinned: boolean;
  priority: number;
  created_at: string;
};

type ProgramRow = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

function rowToItem(r: Row): ProgramItem {
  return {
    id: r.id,
    programId: r.program_id,
    title: r.title,
    orderIndex: r.order_index,
    duration: r.duration,
    status: r.status,
    itemType: r.item_type,
    content: (r.content ?? {}) as ItemContent,
    liveStartedAt: r.live_started_at,
    publishedAt: r.published_at,
    isPinned: r.is_pinned,
    priority: r.priority,
    createdAt: r.created_at,
  };
}

function programRowToProgram(r: ProgramRow): Program {
  return {
    id: r.id,
    name: r.name,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

function sortItems(items: ProgramItem[]): ProgramItem[] {
  return [...items].sort((a, b) => a.orderIndex - b.orderIndex);
}

// ---------- Programs ----------

export function subscribePrograms(cb: (programs: Program[]) => void): () => void {
  let cancelled = false;
  let current: Program[] = [];

  const refresh = async () => {
    const { data, error } = await supabase
      .from("programs")
      .select("*")
      .order("created_at", { ascending: true });
    if (cancelled) return;
    if (error) {
      console.error("[programs] load failed:", error);
      cb([]);
      return;
    }
    current = (data as ProgramRow[]).map(programRowToProgram);
    cb(current);
  };
  void refresh();

  const channel = supabase
    .channel("programs")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "programs" },
      () => {
        void refresh();
      },
    )
    .subscribe();

  return () => {
    cancelled = true;
    void supabase.removeChannel(channel);
  };
}

export async function createProgram(name: string): Promise<Program> {
  const { data, error } = await supabase
    .from("programs")
    .insert({ name })
    .select("*")
    .single();
  if (error) throw error;
  return programRowToProgram(data as ProgramRow);
}

export async function renameProgram(id: string, name: string) {
  const { error } = await supabase.from("programs").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteProgram(id: string) {
  const { error } = await supabase.from("programs").delete().eq("id", id);
  if (error) throw error;
}

export async function setActiveProgram(id: string) {
  const { error } = await supabase.rpc("set_active_program", { _id: id });
  if (error) throw error;
}

// ---------- Items ----------

export function subscribeItems(
  cb: (items: ProgramItem[]) => void,
  programId: string,
): () => void {
  let current: ProgramItem[] = [];
  let cancelled = false;

  void (async () => {
    const { data, error } = await supabase
      .from("program_items")
      .select("*")
      .eq("program_id", programId)
      .order("order_index", { ascending: true });
    if (cancelled) return;
    if (error) {
      console.error("[programs] initial load failed:", error);
      cb([]);
      return;
    }
    current = (data as Row[]).map(rowToItem);
    cb(current);
  })();

  const channel = supabase
    .channel(`program_items:${programId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "program_items",
        filter: `program_id=eq.${programId}`,
      },
      (payload) => {
        if (payload.eventType === "INSERT") {
          current = sortItems([...current, rowToItem(payload.new as Row)]);
        } else if (payload.eventType === "UPDATE") {
          const next = rowToItem(payload.new as Row);
          current = sortItems(current.map((i) => (i.id === next.id ? next : i)));
        } else if (payload.eventType === "DELETE") {
          const oldId = (payload.old as { id?: string }).id;
          if (oldId) current = current.filter((i) => i.id !== oldId);
        }
        cb(current);
      },
    )
    .subscribe();

  return () => {
    cancelled = true;
    void supabase.removeChannel(channel);
  };
}

async function nextOrderIndex(programId: string): Promise<number> {
  const { data, error } = await supabase
    .from("program_items")
    .select("order_index")
    .eq("program_id", programId)
    .order("order_index", { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = data?.[0]?.order_index ?? -1;
  return max + 1;
}

export async function addItem(
  input: {
    title: string;
    duration: number;
    itemType: ItemType;
    content: ItemContent;
    publishedAt?: string | null;
    isPinned?: boolean;
    priority?: number;
  },
  programId: string,
) {
  const order = await nextOrderIndex(programId);
  const { data, error } = await supabase
    .from("program_items")
    .insert({
      program_id: programId,
      title: input.title,
      duration: input.duration,
      item_type: input.itemType,
      content: input.content as unknown as Json,
      order_index: order,
      status: "upcoming",
      published_at: input.publishedAt ?? null,
      is_pinned: input.isPinned ?? false,
      priority: input.priority ?? 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function addItemsBulk(
  inputs: Array<{
    title: string;
    duration: number;
    itemType: ItemType;
    content: ItemContent;
    publishedAt?: string | null;
    isPinned?: boolean;
    priority?: number;
  }>,
  programId: string,
) {
  if (inputs.length === 0) return;
  const start = await nextOrderIndex(programId);
  const rows = inputs.map((input, i) => ({
    program_id: programId,
    title: input.title,
    duration: input.duration,
    item_type: input.itemType,
    content: input.content as unknown as Json,
    order_index: start + i,
    status: "upcoming" as const,
    published_at: input.publishedAt ?? null,
    is_pinned: input.isPinned ?? false,
    priority: input.priority ?? 0,
  }));
  const { error } = await supabase.from("program_items").insert(rows);
  if (error) throw error;
}

export async function updateItem(
  id: string,
  patch: {
    title?: string;
    duration?: number;
    itemType?: ItemType;
    content?: ItemContent;
    publishedAt?: string | null;
    isPinned?: boolean;
    priority?: number;
  },
) {
  const { error } = await supabase
    .from("program_items")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.duration !== undefined ? { duration: patch.duration } : {}),
      ...(patch.itemType !== undefined ? { item_type: patch.itemType } : {}),
      ...(patch.content !== undefined
        ? { content: patch.content as unknown as Json }
        : {}),
      ...(patch.publishedAt !== undefined
        ? { published_at: patch.publishedAt }
        : {}),
      ...(patch.isPinned !== undefined ? { is_pinned: patch.isPinned } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteItem(id: string) {
  const { error } = await supabase.from("program_items").delete().eq("id", id);
  if (error) throw error;
}

export async function duplicateItem(id: string, programId: string) {
  const { data, error } = await supabase
    .from("program_items")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  const row = data as Row;
  const order = await nextOrderIndex(programId);
  const { error: e2 } = await supabase.from("program_items").insert({
    program_id: programId,
    title: `${row.title} (copy)`,
    duration: row.duration,
    item_type: row.item_type,
    content: row.content ?? {},
    order_index: order,
    status: "upcoming",
    published_at: row.published_at,
    is_pinned: row.is_pinned,
    priority: row.priority,
  });
  if (e2) throw e2;
}

export function isAnnouncementPublished(
  item: ProgramItem,
  now = Date.now(),
): boolean {
  if (item.itemType !== "announcement") return true;
  if (!item.publishedAt) return true;
  return new Date(item.publishedAt).getTime() <= now;
}

export function visibleUpcomingItems(
  items: ProgramItem[],
  now = Date.now(),
): ProgramItem[] {
  return items.filter(
    (item) => item.status === "upcoming" && isAnnouncementPublished(item, now),
  );
}

export function visibleAnnouncements(
  items: ProgramItem[],
  now = Date.now(),
): ProgramItem[] {
  return [...items]
    .filter(
      (item) =>
        item.itemType === "announcement" && isAnnouncementPublished(item, now),
    )
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      const aTime = a.publishedAt ?? a.createdAt;
      const bTime = b.publishedAt ?? b.createdAt;
      if (aTime !== bTime) return aTime < bTime ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
}

export async function reorderItems(orderedIds: string[]) {
  // Two-phase: shift to large offsets first to avoid unique-ish collisions, then assign.
  // We don't have a uniqueness constraint, so a single pass is fine.
  const updates = orderedIds.map((id, i) =>
    supabase.from("program_items").update({ order_index: i }).eq("id", id),
  );
  const results = await Promise.all(updates);
  for (const r of results) {
    if (r.error) throw r.error;
  }
}

export async function goLive(itemId: string, programId: string) {
  const { error: e1 } = await supabase
    .from("program_items")
    .update({ status: "completed", live_started_at: null })
    .eq("program_id", programId)
    .eq("status", "live")
    .neq("id", itemId);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("program_items")
    .update({ status: "live", live_started_at: new Date().toISOString() })
    .eq("id", itemId);
  if (e2) throw e2;
}

export async function advanceProgram(
  programId: string,
  direction: "next" | "previous",
): Promise<string | null> {
  const { data, error } = await supabase.rpc("advance_program", {
    _program_id: programId,
    _direction: direction,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function clearLive(programId: string) {
  const { error } = await supabase.rpc("clear_live", { _program_id: programId });
  if (error) throw error;
}
