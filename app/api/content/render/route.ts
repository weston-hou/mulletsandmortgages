/**
 * app/api/content/render/route.ts
 * POST /api/content/render
 *
 * Kicks off Creatomate render jobs for a content clip.
 * Admin-only. Body:
 *   { clip_id, video_url, formats? }
 *
 * video_url must be a publicly accessible HTTPS URL.
 * For Google Drive files: use the direct download URL format:
 *   https://drive.google.com/uc?export=download&id=FILE_ID
 */

import { NextRequest, NextResponse } from "next/server";
import { submitRenderJobs, type VideoFormat } from "@/lib/creatomate";
import { db } from "@/lib/supabase";

function isAdmin(req: NextRequest): boolean {
  const key = process.env.ADMIN_PASSWORD;
  if (!key) return false;
  return req.headers.get("X-Admin-Key") === key;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.CREATOMATE_API_KEY) {
    return NextResponse.json(
      { error: "CREATOMATE_API_KEY not configured" },
      { status: 503 }
    );
  }

  try {
    const { clip_id, video_url, formats } = await req.json() as {
      clip_id:   string;
      video_url: string;
      formats?:  VideoFormat[];
    };

    if (!clip_id || !video_url) {
      return NextResponse.json({ error: "clip_id and video_url required" }, { status: 400 });
    }

    // Fetch the clip to get the slug
    const clips = await db.contentClips.list();
    const clip  = clips.find(c => c.id === clip_id);
    if (!clip) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    const baseUrl    = process.env.NEXT_PUBLIC_BASE_URL ?? "https://mulletsandmortgages.com";
    const webhookUrl = `${baseUrl}/api/content/webhook`;

    const jobs = await submitRenderJobs({
      videoUrl:   video_url,
      clipSlug:   clip.campaign_slug,
      clipId:     clip_id,
      formats,
      webhookUrl,
    });

    // Mark clip as rendering
    await db.contentClips.update(clip_id, {
      ai_suggestions: [
        clip.ai_suggestions,
        `🎬 Rendering started: ${jobs.length} format${jobs.length > 1 ? "s" : ""}`,
        jobs.map(j => `  • ${j.format}: job ${j.jobId}`).join("\n"),
      ].filter(Boolean).join("\n"),
    } as Parameters<typeof db.contentClips.update>[1]);

    return NextResponse.json({
      ok:   true,
      jobs,
      note: `${jobs.length} render job${jobs.length > 1 ? "s" : ""} submitted. Results arrive via webhook when complete.`,
    });

  } catch (err) {
    console.error("[POST /api/content/render]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Render failed" },
      { status: 500 }
    );
  }
}
