import { createFileRoute } from "@tanstack/react-router";
import Seo from "../components/Seo";
import { SEO_PAGES } from "../config/seo";
import { PrivacyPage } from "../features/legal/PolicyPage";

export const Route = createFileRoute("/privacy")({
  component: () => (
    <>
      <Seo {...SEO_PAGES.privacy} />
      <PrivacyPage />
    </>
  ),
});
