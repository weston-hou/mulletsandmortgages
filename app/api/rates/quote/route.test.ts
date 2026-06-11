import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail }));

import { POST } from "./route";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/rates/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Minimal QuickQuote response shape buildCards understands.
function qqResponse(groups: Array<{ name: string; rate: number; price: number }>) {
  return {
    results: {
      $values: groups.map((g) => ({
        name: g.name,
        products: { $values: [{ productName: g.name, rate: g.rate, price: g.price, monthlyPayments: 0 }] },
      })),
    },
  };
}

function mockFetch(response: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(response), { status: ok ? 200 : status }))),
  );
}

const validBody = {
  firstName: "Jordan",
  email: "jordan@example.com",
  purpose: "Purchase a home",
  price: "$450,000",
  downPayment: "$90,000",
  credit: "760+",
  state: "AZ",
  zip: "85254",
  propertyType: "Single family home",
};

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue("email_id");
});

describe("POST /api/rates/quote", () => {
  it("rejects a request missing email/firstName", async () => {
    const res = await POST(req({ purpose: "Purchase a home" }));
    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("fetches rates, emails the quote, and applies the 2-pt buydown", async () => {
    mockFetch(
      qqResponse([
        { name: "Conforming 30 Yr Fixed", rate: 6.5, price: 99.5 },
        { name: "Conforming 15 Yr Fixed", rate: 5.9, price: 99.0 },
      ]),
    );

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const sent = sendEmail.mock.calls[0][0];
    expect(sent.to).toBe("jordan@example.com");
    expect(sent.subject).toBe("Hey Jordan, here are your rate options");
    // 6.5% − 0.50% buydown = 6.000% on the headline card
    expect(sent.html).toContain("6.000%");
  });

  it("returns 500 when the QuickQuote API errors", async () => {
    mockFetch("upstream boom", false, 502);
    const res = await POST(req(validBody));
    expect(res.status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 500 when QuickQuote yields no rate groups", async () => {
    mockFetch(qqResponse([]));
    const res = await POST(req(validBody));
    expect(res.status).toBe(500);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
