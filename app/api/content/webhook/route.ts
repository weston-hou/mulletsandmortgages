/**
 * app/api/content/webhook/route.ts
 * POST /api/content/webhook
 *
 * Receives render completion events from Creatomate.
 * Updates content_clips in Supabase with the rendered video URLs.
 * Notifies Zach via SMS when all formats for a clip are ready.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import notifyZach from "@/lib/notify-zach";
import type { VideoFormat } from "@/lib/creatomate";
import { FORMAT_SPECS } from "@/lib/creatomate";

interface CreatomateWebhookPayload {
  id:            string;
  status:        "succeeded" | "failed";
  url?:          string;
  error_message?: string;
  metadata?:     string;
}

// Column map: format → supabase column on content_clips
const FORMAT_COLUMN: Record<VideoFormat, string> = {
  tiktok_vertical:    "render_tiktok_url",
  instagram_square:   "render_instagram_url",
  youtube_landscape:  "render_youtube_url",
  linkedin_landscape: "render_linkedin_url",
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const payload = await req.json() as CreatomateWebhookPayload;

    if (!payload.metadata) {
      return NextResponse.json({ ok: true, note: "no metadata, skipping" });
    }

    const meta = JSON.parse(payload.metadata) as {
      clip_id: string;
      format: VideoFormat;
      slug: string;
    };

    if (payload.status === "succeeded" && payload.url) {
      const column = FORMAT_COLUMN[meta.format];
      if (column) {
        // Update the clip with the rendered URL
        await db.contentClips.update(meta.clip_id, {
          [column]: payload.url,
        } as Parameters<typeof db.contentClips.update>[1]);

        console.log(`[webhook] Render complete: ${meta.slug} / ${meta.format} → ${payload.url}`);

        // Check if all 4 formats are done — if so, notify Zach
        const clips = await db.contentClips.list();
        const clip = clips.find(c => c.id === meta.clip_id);
        if (clip) {
          const allDone = (Object.keys(FORMAT_COLUMN) as VideoFormat[]).every(
            f => (clip as unknown as Record<string, unknown>)[FORMAT_COLUMN[f]]
          );
          if (allDone) {
            await notifyZach(
              `🎬 All video formats ready for "${meta.slug}"!\n` +
              Object.entries(FORMAT_COLUMN).map(([fmt, col]) =>
                `• ${FORMAT_SPECS[fmt as VideoFormat].label}: ${(clip as unknown as Record<string, unknown>)[col]}`
              ).join("\n")
            );
          }
        }
      }
    } else if (payload.status === "failed") {
      console.error(`[webhook] Render failed: ${meta.slug} / ${meta.format} — ${payload.error_message}`);
      await db.contentClips.update(meta.clip_id, {
        ai_suggestions: `⚠️ Render failed for ${meta.format}: ${payload.error_message}`,
      } as Parameters<typeof db.contentClips.update>[1]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/content/webhook]", err);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
