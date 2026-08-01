export const SITE_URL = "https://palpath.app";
export const SOCIAL_IMAGE_URL = `${SITE_URL}/palpath-social-card.png`;
export const INDEX_ROBOTS = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

export type SeoPage = {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
};

export const SEO_PAGES = {
  inventory: {
    title: "Palworld 1.0 Inventory & Breeding Planner | Palpath",
    description: "Import your Palworld 1.0 save to search your Pals, compare stats and passives, and plan breeding routes from the Pals you already own.",
    path: "/",
  },
  builder: {
    title: "Palworld 1.0 Breeding Route Planner | Palpath",
    description: "Plan a Palworld 1.0 breeding route from your own save. Choose a target Pal and passive skills, then compare fewer breedings with better hatch odds.",
    path: "/builder",
  },
  tools: {
    title: "Palworld 1.0 Breeding Calculator | Palpath",
    description: "Use current Palworld 1.0 breeding data to check what two parents produce or find the shortest breeding path between any two of the 299 Pals.",
    path: "/tools",
  },
  privacy: {
    title: "Privacy | Palpath",
    description: "How Palpath handles local saves and optional account data.",
    path: "/privacy",
    noIndex: true,
  },
  legal: {
    title: "Legal & Licenses | Palpath",
    description: "Legal notices, licenses, and third-party software used by Palpath.",
    path: "/legal",
    noIndex: true,
  },
  credits: {
    title: "Credits | Palpath",
    description: "Data and open-source credits for Palpath.",
    path: "/credits",
    noIndex: true,
  },
} as const satisfies Record<string, SeoPage>;

export function canonicalUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}
