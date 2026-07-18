import { createFileRoute, useNavigate } from "@tanstack/react-router";
import PairPage from "../features/pair/PairPage";
import { setPairInput, setPairSelection, swapPairSearch } from "../features/pair/pairNavigation";
import { parsePairSearch } from "../features/pair/pairSearch";
import { shouldReplaceSearch, type SearchUpdateMode } from "../routing/searchParams";

export const Route = createFileRoute("/pair")({
  validateSearch: parsePairSearch,
  component: PairRoute,
});

function PairRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const updateSearch = (nextSearch: typeof search, mode: SearchUpdateMode = "replace") => {
    void navigate({ to: ".", search: nextSearch, replace: shouldReplaceSearch(mode) });
  };

  return (
    <PairPage
      search={search}
      onFirstInputChange={(value) => updateSearch(setPairInput(search, "first", value))}
      onSecondInputChange={(value) => updateSearch(setPairInput(search, "second", value))}
      onFirstSelectionChange={(value) => updateSearch(setPairSelection(search, "first", value), "push")}
      onSecondSelectionChange={(value) => updateSearch(setPairSelection(search, "second", value), "push")}
      onSwap={() => updateSearch(swapPairSearch(search), "push")}
    />
  );
}
