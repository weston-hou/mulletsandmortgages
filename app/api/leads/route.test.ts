import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the Supabase data layer so no real network calls happen.
// vi.hoisted ensures these exist when the hoisted vi.mock factory runs.
const { insert, list } = vi.hoisted(() => ({ insert: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ db: { leads: { insert, list } } }));

import { POST, GET } from "./route";

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validLead = {
  firstName: "Jordan",
  lastName: "Rivers",
  email: "jordan@example.com",
  loanPurpose: "Purchase a home",
  preferredContact: "email",
};

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockResolvedValue({ id: "lead_123" });
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))));
  process.env.ADMIN_PASSWORD = "secret";
});

describe("POST /api/leads", () => {
  it("rejects a body missing required contact fields", async () => {
    const res = await POST(postReq({ firstName: "Jordan" }));
    expect(res.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates a lead and returns 201 with its id", async () => {
    const res = await POST(postReq(validLead));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: "lead_123", success: true });

    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = insert.mock.calls[0][0];
    expect(inserted.first_name).toBe("Jordan");
    expect(inserted.email).toBe("jordan@example.com");
    expect(inserted.stage).toBe("new");
    expect(inserted.preferred_contact).toBe("email");
  });

  it("does NOT trigger the SMS agent for email-preferring leads", async () => {
    await POST(postReq(validLead));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("triggers the SMS agent for sms/voice leads", async () => {
    await POST(postReq({ ...validLead, preferredContact: "sms" }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("/api/agent/sms");
  });

  it("returns 500 when the insert throws", async () => {
    insert.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(postReq(validLead));
    expect(res.status).toBe(500);
  });
});

describe("GET /api/leads (admin only)", () => {
  it("rejects requests without the admin key", async () => {
    const res = await GET(new NextRequest("http://localhost/api/leads"));
    expect(res.status).toBe(401);
  });

  it("rejects a wrong admin key", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/leads", { headers: { "X-Admin-Key": "nope" } }),
    );
    expect(res.status).toBe(401);
  });

  it("returns leads for an authorized request", async () => {
    list.mockResolvedValue([{ id: "lead_1" }]);
    const res = await GET(
      new NextRequest("http://localhost/api/leads?limit=10", {
        headers: { "X-Admin-Key": "secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(list).toHaveBeenCalled();
  });
});
