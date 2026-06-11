import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "./page";

// next/navigation's useRouter isn't available outside the Next runtime.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

describe("Landing page (<Home />)", () => {
  it("renders step 1 with the loan-purpose options", () => {
    render(<Home />);
    expect(screen.getByText("What are you looking to do?")).toBeInTheDocument();
    expect(screen.getByText("Purchase a home")).toBeInTheDocument();
    expect(screen.getByText("Refinance my current home")).toBeInTheDocument();
  });

  it("advances to the loan-details step after picking a purpose", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(screen.getByText("Purchase a home"));
    // advanceStep fires on a short timer; findBy waits for it. Target the heading
    // since "Loan details" also appears in the step indicator.
    expect(await screen.findByRole("heading", { name: "Loan details" })).toBeInTheDocument();
  });
});
