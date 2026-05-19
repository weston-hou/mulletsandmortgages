/**
 * lib/creatomate.ts
 * Creatomate video formatting pipeline for Mullets & Mortgages.
 *
 * Takes a master video URL (public Google Drive link or any HTTPS URL)
 * and renders it in all social formats using Creatomate's RenderScript API.
 *
 * Formats produced:
 *   - tiktok_vertical    : 1080×1920, 9:16, max 60s (TikTok / Instagram Reels / YouTube Shorts)
 *   - instagram_square   : 1080×1080, 1:1, max 60s (Instagram feed)
 *   - youtube_landscape  : 1920×1080, 16:9, full length (YouTube long-form)
 *   - linkedin_landscape : 1920×1080, 16:9, max 10min (LinkedIn)
 *
 * Requires CREATOMATE_API_KEY env var.
 * Webhook: /api/content/webhook?secret=CREATOMATE_WEBHOOK_SECRET
 */

const CREATOMATE_API = "https://api.creatomate.com/v2/renders";

export type VideoFormat = "tiktok_vertical" | "instagram_square" | "youtube_landscape" | "linkedin_landscape";

export interface RenderJob {
  id:            string;
  status:        "planned" | "waiting" | "transcoding" | "rendering" | "succeeded" | "failed";
  url?:          string;   // download URL when succeeded
  error_message?: string;
  metadata?:     string;
}

export interface FormatSpec {
  format:  VideoFormat;
  width:   number;
  height:  number;
  label:   string;
  maxSecs: number | null;  // null = full length
}

export const FORMAT_SPECS: Record<VideoFormat, FormatSpec> = {
  tiktok_vertical:    { format: "tiktok_vertical",    width: 1080, height: 1920, label: "TikTok / Reels / Shorts", maxSecs: 60 },
  instagram_square:   { format: "instagram_square",   width: 1080, height: 1080, label: "Instagram Feed",          maxSecs: 60 },
  youtube_landscape:  { format: "youtube_landscape",  width: 1920, height: 1080, label: "YouTube",                 maxSecs: null },
  linkedin_landscape: { format: "linkedin_landscape", width: 1920, height: 1080, label: "LinkedIn",                maxSecs: 600 },
};

// ─── RenderScript builder ──────────────────────────────────────────────────────
// Uses Creatomate's scene-based RenderScript (no template required).
// Smart crop centers on the speaker for vertical formats.

function buildRenderScript(
  videoUrl: string,
  spec: FormatSpec,
  clipSlug: string,
): object {
  const { width, height, maxSecs } = spec;
  const isVertical = height > width;

  return {
    output_format: "mp4",
    width,
    height,
    elements: [
      {
        type:    "video",
        source:  videoUrl,
        // Smart crop: for vertical formats, use "smart" fill to center on faces
        fill_mode: isVertical ? "smart-crop" : "cover",
        // Trim to max duration if needed
        ...(maxSecs ? { duration: maxSecs } : {}),
        // Amber lower-third branding for short-form
        ...(isVertical ? {
          elements: [
            {
              type:        "shape",
              x:           "0%",
              y:           "85%",
              width:       "100%",
              height:      "10%",
              fill_color:  "rgba(0,0,0,0.55)",
            },
            {
              type:        "text",
              x:           "5%",
              y:           "86%",
              width:       "90%",
              height:      "4%",
              text:        "✂️ Mullets & Mortgages",
              font_family: "Arial",
              font_weight: "900",
              font_size:   "3.5 vmin",
              color:       "#f59e0b",
            },
            {
              type:        "text",
              x:           "5%",
              y:           "90%",
              width:       "90%",
              height:      "3%",
              text:        "mulletsandmortgages.com  |  @mulletsandmortgages",
              font_family: "Arial",
              font_weight: "400",
              font_size:   "2.5 vmin",
              color:       "#ffffff",
            },
          ],
        } : {}),
      },
    ],
    // Metadata for webhook to identify the job
    // (stored as string, parsed on webhook receipt)
  };
}

// ─── API calls ─────────────────────────────────────────────────────────────────

async function apiPost(body: object): Promise<RenderJob> {
  const key = process.env.CREATOMATE_API_KEY;
  if (!key) throw new Error("CREATOMATE_API_KEY is not set");

  const res = await fetch(CREATOMATE_API, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Creatomate error (${res.status}): ${text}`);
  }

  // Creatomate returns an array of render jobs (one per render in the batch)
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function getRenderStatus(renderId: string): Promise<RenderJob> {
  const key = process.env.CREATOMATE_API_KEY;
  if (!key) throw new Error("CREATOMATE_API_KEY is not set");

  const res = await fetch(`${CREATOMATE_API}/${renderId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) throw new Error(`Creatomate status error: ${await res.text()}`);
  return res.json() as Promise<RenderJob>;
}

// ─── Public interface ──────────────────────────────────────────────────────────

export interface RenderRequest {
  videoUrl:      string;   // public HTTPS URL of master video
  clipSlug:      string;   // used for metadata/tracking
  clipId:        string;   // Supabase content_clips.id
  formats?:      VideoFormat[];  // default: all
  webhookUrl?:   string;
}

export interface RenderResult {
  format:   VideoFormat;
  jobId:    string;
  status:   string;
}

/**
 * Submit render jobs for all requested formats.
 * Returns immediately with job IDs — results come via webhook or polling.
 */
export async function submitRenderJobs(req: RenderRequest): Promise<RenderResult[]> {
  const formats = req.formats ?? (Object.keys(FORMAT_SPECS) as VideoFormat[]);
  const webhookUrl = req.webhookUrl ?? `${process.env.NEXT_PUBLIC_BASE_URL}/api/content/webhook`;

  const results: RenderResult[] = [];

  for (const format of formats) {
    const spec   = FORMAT_SPECS[format];
    const script = buildRenderScript(req.videoUrl, spec, req.clipSlug);

    const job = await apiPost({
      render_script: script,
      webhook_url:   webhookUrl,
      metadata:      JSON.stringify({ clip_id: req.clipId, format, slug: req.clipSlug }),
    });

    results.push({ format, jobId: job.id, status: job.status });
  }

  return results;
}
