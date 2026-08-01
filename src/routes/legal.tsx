import { createFileRoute } from "@tanstack/react-router";
import Seo from "../components/Seo";
import { SEO_PAGES } from "../config/seo";
import { LegalPage } from "../features/legal/PolicyPage";

export const Route = createFileRoute("/legal")({
  component: () => (
    <>
      <Seo {...SEO_PAGES.legal} />
      <LegalPage />
    </>
  ),
});
