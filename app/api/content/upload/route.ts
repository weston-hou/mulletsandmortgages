/**
 * app/api/content/upload/route.ts
 * POST /api/content/upload
 *
 * Accepts multipart form data with up to 3 video files + metadata.
 * Uploads each file to Google Drive under Mullets & Mortgages/Video Uploads/{slug}/
 * Creates a content_clips row in Supabase.
 * Returns the Drive file URLs + clip ID.
 *
 * Form fields:
 *   files[]       : video files (1–3)
 *   campaign_slug : short identifier, e.g. "ep-12-first-time-buyers"
 *   platform      : tiktok | youtube | linkedin | instagram (default: all)
 *   notes         : optional free text from Zach
 *
 * Admin-only (X-Admin-Key header).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { ensureFolders, uploadFileToDrive, type UploadedFile } from "@/lib/google-drive";

function isAdmin(req: NextRequest): boolean {
  const key = process.env.ADMIN_PASSWORD;
  if (!key) return false;
  return req.headers.get("X-Admin-Key") === key;
}

// Max file size: 4GB (Vercel streaming limit is lower, but we handle chunks)
// Vercel Pro: 4.5MB body limit by default — for large video files we use
// presigned URLs in production. For now we handle up to ~4MB per file.
// TODO: swap to resumable Drive upload for large files.

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check Google Drive is configured
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json(
      { error: "Google Drive not configured — add GOOGLE_SERVICE_ACCOUNT_JSON to env vars" },
      { status: 503 }
    );
  }

  try {
    const formData    = await req.formData();
    const files       = formData.getAll("files[]") as File[];
    const slug        = (formData.get("campaign_slug") as string | null)?.trim();
    const platform    = (formData.get("platform") as string | null)?.trim() ?? "all";
    const notes       = (formData.get("notes") as string | null)?.trim() ?? "";

    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }
    if (files.length > 3) {
      return NextResponse.json({ error: "Maximum 3 files allowed" }, { status: 400 });
    }
    if (!slug) {
      return NextResponse.json({ error: "campaign_slug is required" }, { status: 400 });
    }

    // Validate file types
    const ALLOWED_TYPES = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/mov"];
    for (const file of files) {
      const type = file.type || "video/mp4";
      if (!ALLOWED_TYPES.some(t => type.startsWith("video/"))) {
        return NextResponse.json(
          { error: `File "${file.name}" is not a video file` },
          { status: 400 }
        );
      }
    }

    // Ensure Drive folders exist
    const { videos: videosFolderId, token } = await ensureFolders();

    // Create a subfolder for this campaign slug
    const createFolderRes = await fetch(
      "https://www.googleapis.com/drive/v3/files",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `${new Date().toISOString().slice(0, 10)} — ${slug}`,
          mimeType: "application/vnd.google-apps.folder",
          parents: [videosFolderId],
        }),
      }
    );
    const folderData = await createFolderRes.json() as { id: string };
    const campaignFolderId = folderData.id;

    // Upload each file
    const uploaded: UploadedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file   = files[i];
      const label  = files.length > 1 ? `-cam${i + 1}` : "";
      const ext    = file.name.split(".").pop() ?? "mp4";
      const name   = `${slug}${label}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadFileToDrive(name, file.type || "video/mp4", buffer, campaignFolderId, token);
      uploaded.push(result);
    }

    // Create content_clips row
    const clip = await db.contentClips.insert({
      campaign_slug:  slug,
      platform:       platform === "all" ? "tiktok" : platform, // default display platform
      views:          0,
      clicks:         0,
      leads_generated: 0,
      ai_suggestions: notes || undefined,
    });

    // Store Drive file links as metadata (update the clip with JSON in ai_suggestions for now)
    const driveLinks = uploaded.map(f => `${f.name}: ${f.webViewLink}`).join("\n");
    const fullNotes  = [
      notes,
      `📁 Drive files (${uploaded.length}):`,
      driveLinks,
      `📂 Folder: https://drive.google.com/drive/folders/${campaignFolderId}`,
    ].filter(Boolean).join("\n");

    await db.contentClips.update(clip.id, { ai_suggestions: fullNotes });

    return NextResponse.json({
      ok:            true,
      clip_id:       clip.id,
      campaign_slug: slug,
      folder_url:    `https://drive.google.com/drive/folders/${campaignFolderId}`,
      files:         uploaded.map(f => ({ name: f.name, url: f.webViewLink })),
      message:       `${uploaded.length} file${uploaded.length > 1 ? "s" : ""} uploaded to Drive successfully`,
    });

  } catch (err) {
    console.error("[POST /api/content/upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}

// Next.js config: disable body parser for file uploads
export const config = {
  api: { bodyParser: false },
};
