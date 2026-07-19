import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const publisherId = environment.VITE_ADSENSE_PUBLISHER_ID?.trim();
  if (publisherId && !/^ca-pub-\d{16}$/.test(publisherId)) {
    throw new Error("VITE_ADSENSE_PUBLISHER_ID must use the ca-pub-################ format.");
  }

  return {
    base: mode === "github-pages" ? "/palbreed/" : "/",
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      releaseArtifacts(publisherId),
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

function releaseArtifacts(publisherId: string | undefined): Plugin {
  return {
    name: "palpath-release-artifacts",
    transformIndexHtml() {
      return publisherId ? [{
        tag: "meta",
        attrs: { name: "google-adsense-account", content: publisherId },
        injectTo: "head" as const,
      }] : [];
    },
    generateBundle() {
      if (publisherId) {
        this.emitFile({
          type: "asset",
          fileName: "ads.txt",
          source: `google.com, ${publisherId.replace("ca-", "")}, DIRECT, f08c47fec0942fa0\n`,
        });
      }

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
