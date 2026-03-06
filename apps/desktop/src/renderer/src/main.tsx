import "@fontsource-variable/fraunces";
import "@fontsource/ibm-plex-mono";
import "@fontsource/ibm-plex-sans";

import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
