/**
 * Analytics & UTM utilities
 * Captures UTM params + clicked_at from URL on page load.
 * Stores in sessionStorage so every step has access.
 * PostHog is initialized in the root layout snippet.
 */

export interface TrackingContext {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  clicked_at?: string;  // unix timestamp (seconds) set when the social post link was generated
  landed_at: number;    // unix timestamp (ms) when the user actually loaded the page
  referrer: string;
}

export function captureTrackingContext(): TrackingContext {
  if (typeof window === "undefined") {
    return { landed_at: 0, referrer: "" };
  }

  const params = new URLSearchParams(window.location.search);
  const ctx: TrackingContext = {
    utm_source:   params.get("utm_source")   ?? undefined,
    utm_medium:   params.get("utm_medium")   ?? undefined,
    utm_campaign: params.get("utm_campaign") ?? undefined,
    utm_content:  params.get("utm_content")  ?? undefined,
    utm_term:     params.get("utm_term")     ?? undefined,
    clicked_at:   params.get("clicked_at")  ?? undefined,
    landed_at:    Date.now(),
    referrer:     document.referrer,
  };

  try {
    sessionStorage.setItem("tracking_ctx", JSON.stringify(ctx));
  } catch {}

  return ctx;
}

export function getTrackingContext(): TrackingContext {
  if (typeof window === "undefined") return { landed_at: 0, referrer: "" };
  try {
    const stored = sessionStorage.getItem("tracking_ctx");
    if (stored) return JSON.parse(stored);
  } catch {}
  return captureTrackingContext();
}

// PostHog event helpers — safe to call even if PH hasn't loaded yet
declare global {
  interface Window {
    posthog?: {
      capture: (event: string, props?: Record<string, unknown>) => void;
      identify: (distinctId: string, props?: Record<string, unknown>) => void;
    };
  }
}

export function track(event: string, props?: Record<string, unknown>) {
  try {
    const ctx = getTrackingContext();
    window.posthog?.capture(event, {
      ...props,
      ...ctx,
      time_on_page_ms: Date.now() - ctx.landed_at,
    });
  } catch {}
}

export function identify(email: string, props?: Record<string, unknown>) {
  try {
    window.posthog?.identify(email, props);
  } catch {}
}
