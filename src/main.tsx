import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import { router } from "./router";
import { clearRememberedSaveFolders } from "./services/saveImport/fileSystemDirectory";
import "./index.css";

clearRememberedSaveFolders();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Analytics />
  </React.StrictMode>,
);
