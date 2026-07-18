import { createFileRoute, useNavigate } from "@tanstack/react-router";
import InventoryPage from "../features/inventory/InventoryPage";
import {
  parseInventorySearch,
  setInventoryPlatform,
  setInventoryStart,
  setInventoryStartInput,
  setInventoryTarget,
  setInventoryTargetInput,
} from "../features/inventory/inventorySearch";
import { shouldReplaceSearch, type SearchUpdateMode } from "../routing/searchParams";

export const Route = createFileRoute("/inventory")({
  validateSearch: parseInventorySearch,
  component: InventoryRoute,
});

function InventoryRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const updateSearch = (nextSearch: typeof search, mode: SearchUpdateMode = "replace") => {
    void navigate({ to: ".", search: nextSearch, replace: shouldReplaceSearch(mode) });
  };

  const setAddPalOpen = (isOpen: boolean) => {
    updateSearch(
      { ...search, modal: isOpen ? "add-pal" : undefined },
      isOpen ? "push" : "replace",
    );
  };

  return (
    <InventoryPage
      search={search}
      onPlatformChange={(value) => updateSearch(setInventoryPlatform(search, value), "push")}
      onStartInputChange={(value) => updateSearch(setInventoryStartInput(search, value))}
      onStartSelectionChange={(value) => updateSearch(setInventoryStart(search, value), "push")}
      onTargetInputChange={(value) => updateSearch(setInventoryTargetInput(search, value))}
      onTargetSelectionChange={(value) => updateSearch(setInventoryTarget(search, value), "push")}
      isAddPalOpen={search.modal === "add-pal"}
      onAddPalOpenChange={setAddPalOpen}
    />
  );
}
