import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const workspaceRoot = resolve(__dirname, "../..");
const alias = {
  "@clawcut/domain": resolve(workspaceRoot, "packages/domain/src/index.ts"),
  "@clawcut/ipc": resolve(workspaceRoot, "packages/ipc/src/index.ts"),
  "@clawcut/media-worker": resolve(workspaceRoot, "packages/media-worker/src/index.ts")
};

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ["@clawcut/domain", "@clawcut/ipc", "@clawcut/media-worker"]
      })
    ],
    build: {
      rollupOptions: {
        external: ["@resvg/resvg-js", "@resvg/resvg-js-darwin-arm64"]
      }
    },
    resolve: {
      alias
    }
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ["@clawcut/ipc"]
      })
    ],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "index.js"
        }
      }
    },
    resolve: {
      alias
    }
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    resolve: {
      alias
    }
  }
});
