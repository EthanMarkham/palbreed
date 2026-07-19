import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig(({ mode }) => ({
  base: mode === "github-pages" ? "/palbreed/" : "/",
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // Keep the GPL Oodle compatibility layer behind the save-import
              // boundary instead of shipping it in the initial app bundle.
              name: "oodle",
              test: /node_modules[\\/](ooz-wasm)[\\/]/,
              priority: 30,
            },
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: "react-aria",
              test: /node_modules[\\/](react-aria-components|react-aria|react-stately|@react-types|@internationalized)[\\/]/,
              priority: 10,
            },
            {
              name: "vendor",
              test: /node_modules[\\/]/,
              priority: 1,
            },
          ],
        },
      },
    },
  },
}));
