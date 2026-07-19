import { createFileRoute, useNavigate } from "@tanstack/react-router";
import InventoryPage from "../features/inventory/InventoryPage";
import {
  parseInventorySearch,
  setInventoryQuery,
  setInventoryWorld,
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
    <InventoryPage
      search={search}
      onWorldChange={(value, mode = "push") => updateSearch(setInventoryWorld(search, value), mode)}
      onQueryChange={(value) => updateSearch(setInventoryQuery(search, value))}
    />
  );
}
