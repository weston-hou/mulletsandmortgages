import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { captureTrackingContext, getTrackingContext, track, identify } from "./analytics";

function setUrl(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

beforeEach(() => {
  sessionStorage.clear();
  setUrl("");
  delete window.posthog;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("captureTrackingContext", () => {
  it("parses UTM params and clicked_at from the URL", () => {
    setUrl("?utm_source=tiktok&utm_medium=video&utm_campaign=jun&clicked_at=1780710432");
    const ctx = captureTrackingContext();
    expect(ctx.utm_source).toBe("tiktok");
    expect(ctx.utm_medium).toBe("video");
    expect(ctx.utm_campaign).toBe("jun");
    expect(ctx.clicked_at).toBe("1780710432");
    expect(ctx.landed_at).toBeGreaterThan(0);
  });

  it("leaves absent params undefined", () => {
    const ctx = captureTrackingContext();
    expect(ctx.utm_source).toBeUndefined();
    expect(ctx.utm_term).toBeUndefined();
  });

  it("persists the context to sessionStorage", () => {
    setUrl("?utm_source=newsletter");
    captureTrackingContext();
    const stored = JSON.parse(sessionStorage.getItem("tracking_ctx") ?? "{}");
    expect(stored.utm_source).toBe("newsletter");
  });
});

describe("getTrackingContext", () => {
  it("returns the previously stored context", () => {
    setUrl("?utm_source=stored");
    captureTrackingContext();
    setUrl(""); // even after the URL changes, the stored value wins
    expect(getTrackingContext().utm_source).toBe("stored");
  });

  it("captures fresh when nothing is stored", () => {
    setUrl("?utm_source=fresh");
    expect(getTrackingContext().utm_source).toBe("fresh");
  });
});

describe("track / identify", () => {
  it("forwards events to posthog with merged tracking context", () => {
    setUrl("?utm_source=tiktok");
    const capture = vi.fn();
    window.posthog = { capture, identify: vi.fn() };

    track("step_completed", { step: 2 });

    expect(capture).toHaveBeenCalledTimes(1);
    const [event, props] = capture.mock.calls[0];
    expect(event).toBe("step_completed");
    expect(props.step).toBe(2);
    expect(props.utm_source).toBe("tiktok");
    expect(props).toHaveProperty("time_on_page_ms");
  });

  it("does not throw when posthog is absent", () => {
    expect(() => track("noop")).not.toThrow();
    expect(() => identify("a@b.com")).not.toThrow();
  });

  it("identifies the user when posthog is present", () => {
    const identifyFn = vi.fn();
    window.posthog = { capture: vi.fn(), identify: identifyFn };
    identify("a@b.com", { plan: "pro" });
    expect(identifyFn).toHaveBeenCalledWith("a@b.com", { plan: "pro" });
  });
});
