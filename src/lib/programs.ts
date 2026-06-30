import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_PROGRAM_ID = "default";

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
  title: string;
  orderIndex: number;
  duration: number;
  status: ItemStatus;
  itemType?: ItemType;
  content?: ItemContent;
}

type Row = {
  id: string;
  title: string;
  order_index: number;
  duration: number;
  status: ItemStatus;
  item_type: ItemType;
  content: ItemContent | null;
  program_id: string;
};

function rowToItem(r: Row): ProgramItem {
  return {
    id: r.id,
    title: r.title,
    orderIndex: r.order_index,
    duration: r.duration,
    status: r.status,
    itemType: r.item_type,
    content: r.content ?? {},
  };
}

function sortItems(items: ProgramItem[]): ProgramItem[] {
  return [...items].sort((a, b) => a.orderIndex - b.orderIndex);
}

export function subscribeItems(
  cb: (items: ProgramItem[]) => void,
  programId: string = DEFAULT_PROGRAM_ID,
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
  },
  programId: string = DEFAULT_PROGRAM_ID,
) {
  const order = await nextOrderIndex(programId);
  const { error } = await supabase.from("program_items").insert({
    program_id: programId,
    title: input.title,
    duration: input.duration,
    item_type: input.itemType,
    content: input.content,
    order_index: order,
    status: "upcoming",
  });
  if (error) throw error;
}

export async function addItemsBulk(
  inputs: Array<{
    title: string;
    duration: number;
    itemType: ItemType;
    content: ItemContent;
  }>,
  programId: string = DEFAULT_PROGRAM_ID,
) {
  if (inputs.length === 0) return;
  const start = await nextOrderIndex(programId);
  const rows = inputs.map((input, i) => ({
    program_id: programId,
    title: input.title,
    duration: input.duration,
    item_type: input.itemType,
    content: input.content,
    order_index: start + i,
    status: "upcoming" as const,
  }));
  const { error } = await supabase.from("program_items").insert(rows);
  if (error) throw error;
}

export async function goLive(
  itemId: string,
  programId: string = DEFAULT_PROGRAM_ID,
) {
  const { error: e1 } = await supabase
    .from("program_items")
    .update({ status: "completed" })
    .eq("program_id", programId)
    .eq("status", "live")
    .neq("id", itemId);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("program_items")
    .update({ status: "live" })
    .eq("id", itemId);
  if (e2) throw e2;
}
