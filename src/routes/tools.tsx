import { createFileRoute, useNavigate } from "@tanstack/react-router";
import ToolsPage from "../features/tools/ToolsPage";
import {
  parseToolsSearch,
  setToolsInput,
  setToolsSelection,
  swapToolsSelections,
} from "../features/tools/toolsSearch";
import { shouldReplaceSearch, type SearchUpdateMode } from "../routing/searchParams";

export const Route = createFileRoute("/tools")({
  validateSearch: parseToolsSearch,
  component: ToolsRoute,
});

function ToolsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const updateSearch = (nextSearch: typeof search, mode: SearchUpdateMode = "replace") => {
    void navigate({ to: ".", search: nextSearch, replace: shouldReplaceSearch(mode) });
  };

  return (
    <ToolsPage
      search={search}
      onInputChange={(field, value) => updateSearch(setToolsInput(search, field, value))}
      onSelectionChange={(field, value) => updateSearch(setToolsSelection(search, field, value), "push")}
      onSwapPath={() => updateSearch(swapToolsSelections(search, "path"), "push")}
      onSwapParents={() => updateSearch(swapToolsSelections(search, "parents"), "push")}
    />
  );
}
