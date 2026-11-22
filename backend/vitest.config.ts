import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { setupFiles: ["tests/setup.ts"], include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"], testTimeout: 30000, fileParallelism: false },
});
