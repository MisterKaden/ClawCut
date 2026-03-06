import "@fontsource-variable/fraunces";
import "@fontsource/ibm-plex-mono";
import "@fontsource/ibm-plex-sans";

import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { previewController } from "./preview-controller";
import "./styles.css";

window.clawcutPreview = {
  executeCommand(command) {
    return previewController.executeCommand(command);
  },
  getPreviewState() {
    return previewController.getPreviewState();
  },
  captureFrameSnapshot(options) {
    return previewController.captureFrameSnapshot(options);
  },
  subscribeToPreviewState(listener) {
    return previewController.subscribeToPreviewState(listener);
  }
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
