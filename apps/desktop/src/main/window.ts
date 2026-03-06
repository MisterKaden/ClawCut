import * as electron from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function createMainWindow(): electron.BrowserWindow {
  const { BrowserWindow } = electron;
  const preloadPath = existsSync(join(__dirname, "../preload/index.js"))
    ? join(__dirname, "../preload/index.js")
    : join(__dirname, "../preload/index.mjs");

  const window = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#0e1317",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}
