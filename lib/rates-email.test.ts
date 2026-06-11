import { describe, it, expect } from "vitest";
import { buildRatesEmailHtml, type RateCardData, type RatesEmailOptions } from "./rates-email";

const cards: RateCardData[] = [
  { badge: "Best Match", rate: 5.875, apr: 6.012, type: "30-yr Fixed", payment: 2400, highlight: true },
  { badge: "Build equity faster", rate: 5.25, apr: 5.4, type: "15-yr Fixed", payment: 3200, highlight: false, note: "VA" },
];

function opts(overrides: Partial<RatesEmailOptions> = {}): RatesEmailOptions {
  return {
    firstName: "Jordan",
    email: "jordan@example.com",
    purpose: "Purchase",
    price: "$450,000",
    downPayment: "$90,000",
    credit: "740-759",
    zip: "85254",
    cards,
    prequal_url: "https://mulletsandmortgages.com/apply?lead=abc",
    apply_url: "https://prod.lendingpad.com/apply",
    ...overrides,
  };
}

describe("buildRatesEmailHtml", () => {
  const html = buildRatesEmailHtml(opts());

  it("greets the recipient by first name", () => {
    expect(html).toContain("Hey Jordan");
  });

  it("renders the scenario line from the provided fields", () => {
    expect(html).toContain("Purchase · $450,000 · $90,000 down · 740-759 · AZ 85254");
  });

  it("shows each card's rate to three decimals", () => {
    expect(html).toContain("5.875%");
    expect(html).toContain("5.250%");
  });

  it("stars and labels the highlighted card", () => {
    expect(html).toContain("⭐ Best Match");
    expect(html).toContain("Build equity faster");
  });

  it("includes both CTA links", () => {
    expect(html).toContain('href="https://mulletsandmortgages.com/apply?lead=abc"');
    expect(html).toContain('href="https://prod.lendingpad.com/apply"');
  });

  it("notes the 2-point buydown for compliance", () => {
    expect(html).toContain("2 pts applied");
    expect(html).toContain("2-point buydown");
  });

  it("omits empty scenario fields gracefully", () => {
    const partial = buildRatesEmailHtml(opts({ downPayment: "", zip: "" }));
    expect(partial).toContain("Purchase · $450,000 · 740-759");
    expect(partial).not.toContain("down ·");
  });
});
