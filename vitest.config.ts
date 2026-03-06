import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.ts"],
    coverage: {
      enabled: false
    }
  },
  resolve: {
    alias: {
      "@clawcut/domain": "/Users/winten/Developer/KPStudio/packages/domain/src/index.ts",
      "@clawcut/ipc": "/Users/winten/Developer/KPStudio/packages/ipc/src/index.ts",
      "@clawcut/media-worker": "/Users/winten/Developer/KPStudio/packages/media-worker/src/index.ts"
    }
  }
});
