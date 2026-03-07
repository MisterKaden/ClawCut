import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.ts", "apps/**/src/**/*.test.ts"],
    coverage: {
      enabled: false
    }
  },
  resolve: {
    alias: [
      {
        find: "@clawcut/ipc/control-schema",
        replacement: "/Users/winten/Developer/KPStudio/packages/ipc/src/control-schema.ts"
      },
      {
        find: "@clawcut/domain",
        replacement: "/Users/winten/Developer/KPStudio/packages/domain/src/index.ts"
      },
      {
        find: "@clawcut/ipc",
        replacement: "/Users/winten/Developer/KPStudio/packages/ipc/src/index.ts"
      },
      {
        find: "@clawcut/openclaw-plugin",
        replacement: "/Users/winten/Developer/KPStudio/packages/openclaw-plugin/src/index.ts"
      },
      {
        find: "@clawcut/media-worker",
        replacement: "/Users/winten/Developer/KPStudio/packages/media-worker/src/index.ts"
      }
    ]
  }
});
