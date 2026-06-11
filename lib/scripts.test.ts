import { describe, it, expect } from "vitest";
import { getScript, fillTemplate, intro_v1, intro_v2 } from "./scripts";

describe("getScript", () => {
  it("returns the registered scripts by id", () => {
    expect(getScript("intro_v1")).toBe(intro_v1);
    expect(getScript("intro_v2")).toBe(intro_v2);
  });

  it("throws on an unknown id", () => {
    expect(() => getScript("does_not_exist")).toThrow(/unknown script id/i);
  });
});

describe("fillTemplate", () => {
  it("substitutes known placeholders", () => {
    const out = fillTemplate("Hi {{first_name}}, {{loan_purpose}} in {{zip}}", {
      first_name: "Sam",
      loan_purpose: "a purchase",
      zip: "85254",
    });
    expect(out).toBe("Hi Sam, a purchase in 85254");
  });

  it("replaces missing placeholders with an empty string", () => {
    expect(fillTemplate("Hey {{first_name}}{{missing}}", { first_name: "Sam" })).toBe("Hey Sam");
  });

  it("leaves text without placeholders untouched", () => {
    expect(fillTemplate("no vars here", { first_name: "Sam" })).toBe("no vars here");
  });
});
