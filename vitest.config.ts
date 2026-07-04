import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tools/**/*.test.ts", "../shared/edge-access/**/*.test.ts"],
    fileParallelism: false,
  },
});
