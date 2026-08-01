import { createFileRoute } from "@tanstack/react-router";
import Seo from "../components/Seo";
import { SEO_PAGES } from "../config/seo";
import { CreditsPage } from "../features/legal/PolicyPage";

export const Route = createFileRoute("/credits")({
  component: () => (
    <>
      <Seo {...SEO_PAGES.credits} />
      <CreditsPage />
    </>
  ),
});
