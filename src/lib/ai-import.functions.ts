import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const InputSchema = z.object({
  text: z.string().min(1).max(20000),
});

const ItemSchema = z.object({
  title: z.string(),
  duration: z.number().int().min(0).max(600),
  itemType: z.enum(["announcement", "speaker", "song"]),
  content: z.object({
    body: z.string().optional().default(""),
    speaker: z.string().optional().default(""),
    topic: z.string().optional().default(""),
    bio: z.string().optional().default(""),
    lyrics: z.string().optional().default(""),
  }),
});

const OutputSchema = z.object({
  items: z.array(ItemSchema).max(50),
});

export type ParsedItem = z.infer<typeof ItemSchema>;

const SYSTEM_PROMPT = `You are an assistant that parses raw text from church bulletins, conference schedules, and event programs into a strict JSON program structure.

Rules:
- Walk the text in chronological order from top to bottom; preserve that order in the output.
- Map every item to exactly one widget type:
  - "song": worship songs, hymns, musical pieces. Title = song title. content.lyrics = full lyrics if present, otherwise "".
  - "speaker": sermons, talks, keynotes, presentations by a person. Title = session title. content.speaker = name, content.topic = topic/sermon title, content.bio = bio if present (else "").
  - "announcement": everything else (welcome, prayer, offering, closing, news, generic items).
    content.body = supporting description if present (else "").
- duration is in minutes as a positive integer. If not stated, estimate sensibly (songs 4, announcements 2, speakers 20) — never null.
- ALWAYS include every key (body, speaker, topic, bio, lyrics) in content; use "" for ones that don't apply.
- Do not invent items that aren't in the text. Do not output commentary, only the structured JSON.`;

export const parseBulletin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured (missing LOVABLE_API_KEY).");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    try {
      const { output } = await generateText({
        model,
        system: SYSTEM_PROMPT,
        prompt: `Parse this program text:\n\n${data.text}`,
        output: Output.object({ schema: OutputSchema }),
      });
      return { items: output.items };
    } catch (err) {
      const e = err as { statusCode?: number; status?: number; message?: string };
      const status = e.statusCode ?? e.status;
      if (status === 429) throw new Error("AI is rate limited. Please wait a moment and try again.");
      if (status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Plans & credits.");
      throw new Error(e.message || "AI request failed.");
    }
  });
