/**
 * app/api/content-clips/route.ts
 * GET /api/content-clips — returns all content_clips for the admin dashboard
 * Requires X-Admin-Key header.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

function isAdmin(req: NextRequest): boolean {
  const adminKey = process.env.ADMIN_PASSWORD;
  if (!adminKey) return false;
  return req.headers.get("X-Admin-Key") === adminKey;
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const clips = await db.contentClips.list();
    return NextResponse.json({ clips });
  } catch (err) {
    console.error("[GET /api/content-clips]", err);
    return NextResponse.json({ error: "Failed to fetch clips" }, { status: 500 });
  }
}
