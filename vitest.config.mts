import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  // Explicit alias so vi.mock("@/...") resolves to the same module id as the
  // app's "@/..." imports (tsconfigPaths alone doesn't register for vi.mock).
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    // jsdom is needed for component + browser-API tests; pure-logic tests run fine here too.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Unit/integration tests only. Playwright e2e specs (e2e/**/*.spec.ts) run separately.
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**", "app/api/**"],
      exclude: ["**/*.test.*", "**/*.d.ts"],
    },
  },
});
