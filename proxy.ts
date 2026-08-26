import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Site hibernation switch.
 *
 * The site ships HIBERNATED: every page returns a blank "offline" response and
 * every API route returns 503. Nothing about the business is shown — no contact
 * card, no name, no NMLS numbers. The automated SMS/staging jobs are removed
 * from vercel.json / the workflows.
 *
 * Set SITE_HIBERNATED=0 to run the full site — local dev (.env.local) and the
 * Playwright e2e server do this. To wake the site for good, revert the
 * hibernation commit.
 */
const HIBERNATED = process.env.SITE_HIBERNATED !== "0";

// Minimal, unbranded page served for every route while hibernated. 503 tells
// crawlers the site is unavailable (so the empty page isn't indexed).
const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Offline</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    background: #09090b; color: #52525b;
    font: 14px/1.5 system-ui, -apple-system, sans-serif;
  }
</style>
</head>
<body>This site is currently offline.</body>
</html>`;

export function proxy(request: NextRequest) {
  if (!HIBERNATED) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json(
      { error: "This service is temporarily offline." },
      { status: 503 },
    );
  }

  return new NextResponse(OFFLINE_HTML, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const config = {
  // Everything except Next internals and static assets (paths with a dot).
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
