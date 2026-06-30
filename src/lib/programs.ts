import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  orderBy,
  where,
  writeBatch,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

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
export type ItemContent = AnnouncementContent | SpeakerContent | SongContent | Record<string, never>;

export interface ProgramItem {
  id: string;
  title: string;
  orderIndex: number;
  duration: number;
  status: ItemStatus;
  itemType?: ItemType;
  content?: ItemContent;
}

function itemsCol(programId: string = DEFAULT_PROGRAM_ID) {
  if (!db) throw new Error("Firebase is not configured");
  return collection(db, "programs", programId, "items");
}

export function subscribeItems(
  cb: (items: ProgramItem[]) => void,
  programId: string = DEFAULT_PROGRAM_ID,
): Unsubscribe {
  if (!db) return () => {};
  const q = query(itemsCol(programId), orderBy("orderIndex", "asc"));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProgramItem, "id">) }));
    cb(items);
  });
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
  if (!db) throw new Error("Firebase is not configured");
  const existing = await getDocs(query(itemsCol(programId), orderBy("orderIndex", "desc")));
  const maxOrder = existing.docs[0]?.data().orderIndex ?? -1;
  await addDoc(itemsCol(programId), {
    title: input.title,
    duration: input.duration,
    itemType: input.itemType,
    content: input.content,
    orderIndex: maxOrder + 1,
    status: "upcoming" as ItemStatus,
    createdAt: serverTimestamp(),
  });
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
  if (!db) throw new Error("Firebase is not configured");
  if (inputs.length === 0) return;
  const existing = await getDocs(query(itemsCol(programId), orderBy("orderIndex", "desc")));
  const startIdx = (existing.docs[0]?.data().orderIndex ?? -1) + 1;
  const batch = writeBatch(db);
  inputs.forEach((input, i) => {
    const ref = doc(itemsCol(programId));
    batch.set(ref, {
      title: input.title,
      duration: input.duration,
      itemType: input.itemType,
      content: input.content,
      orderIndex: startIdx + i,
      status: "upcoming" as ItemStatus,
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function goLive(itemId: string, programId: string = DEFAULT_PROGRAM_ID) {
  if (!db) throw new Error("Firebase is not configured");
  const batch = writeBatch(db);
  const liveSnap = await getDocs(query(itemsCol(programId), where("status", "==", "live")));
  liveSnap.forEach((d) => {
    if (d.id !== itemId) batch.update(d.ref, { status: "completed" });
  });
  batch.update(doc(itemsCol(programId), itemId), { status: "live" });
  await batch.commit();
}
