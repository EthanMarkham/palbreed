import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { canonicalUrl, INDEX_ROBOTS, SEO_PAGES, type SeoPage } from "./src/config/seo";

export default defineConfig(({ mode }) => {
  return {
    base: mode === "github-pages" ? "/palbreed/" : "/",
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      routeHtmlArtifacts(),
      releaseArtifacts(),
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
                name: "supabase",
                test: /node_modules[/\\]@supabase[/\\]/,
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
  };
});

function routeHtmlArtifacts(): Plugin {
  return {
    name: "palpath-route-html-artifacts",
    generateBundle: {
      order: "post",
      handler(_, bundle) {
        const indexAsset = bundle["index.html"];
        if (!indexAsset || indexAsset.type !== "asset" || typeof indexAsset.source !== "string") {
          this.error("Vite did not emit the index.html shell needed for route SEO artifacts.");
        }

        for (const page of Object.values(SEO_PAGES) as readonly SeoPage[]) {
          if (page.path === "/") continue;
          this.emitFile({
            type: "asset",
            fileName: `${page.path.slice(1)}/index.html`,
            source: renderRouteHtml(indexAsset.source, page),
          });
        }
      },
    },
  };
}

function renderRouteHtml(source: string, page: SeoPage) {
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const robots = page.noIndex ? "noindex, follow" : INDEX_ROBOTS;
  let html = source
    .replace(/<title>.*?<\/title>/s, `<title>${title}</title>`)
    .replace(metaTagPattern("name", "description"), `<meta name="description" content="${description}" />`)
    .replace(metaTagPattern("name", "robots"), `<meta name="robots" content="${robots}" />`)
    .replace(metaTagPattern("property", "og:title"), `<meta property="og:title" content="${title}" />`)
    .replace(metaTagPattern("property", "og:description"), `<meta property="og:description" content="${description}" />`)
    .replace(metaTagPattern("name", "twitter:title"), `<meta name="twitter:title" content="${title}" />`)
    .replace(metaTagPattern("name", "twitter:description"), `<meta name="twitter:description" content="${description}" />`);

  if (page.noIndex) {
    html = html
      .replace(/\s*<link rel="canonical"[^>]*\/>/, "")
      .replace(/\s*<meta property="og:url"[^>]*\/>/, "");
  } else {
    const url = escapeHtml(canonicalUrl(page.path));
    html = html
      .replace(/<link rel="canonical"[^>]*\/>/, `<link rel="canonical" href="${url}" />`)
      .replace(metaTagPattern("property", "og:url"), `<meta property="og:url" content="${url}" />`);
  }

  return html;
}

function metaTagPattern(attribute: "name" | "property", value: string) {
  return new RegExp(`<meta ${attribute}="${value}" content="[^"]*" \\/>`);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function releaseArtifacts(): Plugin {
  return {
    name: "palpath-release-artifacts",
    generateBundle() {
      const licenses = collectProductionLicenses();
      for (const license of licenses) {
        this.emitFile({ type: "asset", fileName: license.fileName, source: license.text });
      }
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_NOTICES.txt",
        source: [
          "Palpath third-party production dependency notices",
          "Generated from package-lock.json for this deployed build.",
          "",
          ...licenses.map(({ name, version, declaredLicense, fileName }) => (
            `${name}@${version} — ${declaredLicense} — /${fileName}`
          )),
          "",
          "Generated breeding data attribution:",
          "palcalc db v26 — MIT — Copyright 2024 Tyler Camp — https://github.com/tylercamp/palcalc",
          "Palworld names and game data belong to Pocketpair, Inc. and/or their respective rights holders.",
          "",
          "Save parser attribution:",
          "uesave-rs commit 11b2b4907ef6f34337135faed783fef2e450fcaf — MIT — https://github.com/oMaN-Rod/uesave-rs",
          "The browser Oodle compatibility component includes ooz-wasm under GPL-3.0-or-later.",
          "See the exact ooz-wasm license emitted above and the Legal page for corresponding-source access.",
          "",
        ].join("\n"),
      });
    },
  };
}

function collectProductionLicenses() {
  const root = process.cwd();
  const lockfile = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8")) as {
    packages: Record<string, { dev?: boolean; license?: string; version?: string }>;
  };
  return Object.entries(lockfile.packages).flatMap(([packagePath, metadata]) => {
    if (!packagePath || metadata.dev || !packagePath.includes("node_modules/")) return [];
    const absolutePackagePath = resolve(root, packagePath);
    const packageJsonPath = resolve(absolutePackagePath, "package.json");
    if (!existsSync(packageJsonPath)) return [];
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      name?: string;
      version?: string;
      license?: string;
      homepage?: string;
    };
    const name = packageJson.name ?? packagePath.slice(packagePath.lastIndexOf("node_modules/") + 13);
    const version = packageJson.version ?? metadata.version ?? "unknown";
    const licensePath = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE"]
      .map((fileName) => resolve(absolutePackagePath, fileName))
      .find(existsSync);
    const declaredLicense = packageJson.license ?? metadata.license;
    if (!licensePath && !declaredLicense) {
      throw new Error(`Production dependency ${name}@${version} does not include a license file.`);
    }
    const safeName = name.replace(/^@/, "").replaceAll("/", "__");
    return [{
      name,
      version,
      declaredLicense: declaredLicense ?? "see license text",
      fileName: `licenses/${safeName}-${version}.txt`,
      text: licensePath
        ? readFileSync(licensePath, "utf8")
        : [
            `${name}@${version}`,
            `License declared by the published package: ${declaredLicense}`,
            packageJson.homepage ? `Project homepage: ${packageJson.homepage}` : "",
            "The published package did not contain a standalone license file.",
            "",
          ].filter(Boolean).join("\n"),
    }];
  });
}
