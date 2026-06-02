import { defineConfig } from "vitest/config";

export default defineConfig({
  base: process.env.GITHUB_REPOSITORY ? "/ASCII-art-creator/" : "/",
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
