import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Seo from "../components/Seo";
import { SEO_PAGES } from "../config/seo";
import InventoryPage from "../features/inventory/InventoryPage";
import {
  parseInventorySearch,
} from "../features/inventory/inventorySearch";
import { shouldReplaceSearch, type SearchUpdateMode } from "../routing/searchParams";

export const Route = createFileRoute("/")({
  validateSearch: parseInventorySearch,
  component: InventoryRoute,
});

function InventoryRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const updateSearch = (nextSearch: typeof search, mode: SearchUpdateMode = "replace") => {
    void navigate({ to: ".", search: nextSearch, replace: shouldReplaceSearch(mode) });
  };

  return (
    <>
      <Seo {...SEO_PAGES.inventory} />
      <InventoryPage
        search={search}
        onSearchChange={updateSearch}
      />
    </>
  );
}
