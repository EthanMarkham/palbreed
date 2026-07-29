import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { router } from "./router";
import SaveWatchRuntime from "./services/saveImport/SaveWatchRuntime";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SaveWatchRuntime />
    <RouterProvider router={router} />
    <Analytics />
  </React.StrictMode>,
);
