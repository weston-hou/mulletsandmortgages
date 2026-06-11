// Adds @testing-library/jest-dom matchers (e.g. toBeInTheDocument) to Vitest's
// `expect`, and augments its types project-wide for tsc.
import "@testing-library/jest-dom/vitest";

// Unmount React trees between tests (auto-cleanup doesn't run with globals: false).
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(() => cleanup());
