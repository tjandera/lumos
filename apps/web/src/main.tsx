import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { parseShareToken } from "./share/hashRoute";
import { ShareViewer } from "./viewer/ShareViewer";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

// Hash-based routing for the one alternate destination the app has: a
// read-only share link (`#/share/:token`). Resolved once at boot — a share
// link is a standalone destination someone opens (e.g. in a new tab), not an
// in-app navigation target, so there's no need for a live hashchange listener
// or a routing library for this single route.
const shareToken = parseShareToken(window.location.hash);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>{shareToken ? <ShareViewer token={shareToken} /> : <App />}</React.StrictMode>
);
