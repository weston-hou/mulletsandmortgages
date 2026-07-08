import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Site hibernation switch.
 *
 * The site ships HIBERNATED: every page serves the /hibernated contact card,
 * every API route returns 503, and the SMS cron is removed from vercel.json.
 * Set SITE_HIBERNATED=0 to run the full site — local dev (.env.local) and the
 * Playwright e2e server do this. To wake the site for good, revert the
 * hibernation commit.
 */
const HIBERNATED = process.env.SITE_HIBERNATED !== "0";

export function proxy(request: NextRequest) {
  if (!HIBERNATED) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json(
      { error: "This service is temporarily offline." },
      { status: 503 },
    );
  }

  return NextResponse.rewrite(new URL("/hibernated", request.url));
}

export const config = {
  // Everything except Next internals and static assets (paths with a dot).
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
