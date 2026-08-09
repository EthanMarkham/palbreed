import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Seo from "../components/Seo";
import { SEO_PAGES } from "../config/seo";
import BuilderPage from "../features/builder/BuilderPage";
import {
  builderHistoryEntryToSearch,
  builderHistoryService,
} from "../features/builder/builderHistory";
import {
  runBuilderSearch,
  setBuilderAllowsExtraPassives,
  setBuilderObjective,
  setBuilderPassiveQuery,
  setBuilderPassives,
  setBuilderTarget,
  setBuilderTargetInput,
} from "../features/builder/builderNavigation";
import { parseBuilderSearch } from "../features/builder/builderSearch";
import { shouldReplaceSearch, type SearchUpdateMode } from "../routing/searchParams";

export const Route = createFileRoute("/builder")({
  validateSearch: parseBuilderSearch,
  component: BuilderRoute,
});

function BuilderRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const navigateToSearch = (nextSearch: typeof search, mode: SearchUpdateMode = "replace") => (
    navigate({ to: ".", search: nextSearch, replace: shouldReplaceSearch(mode) })
  );
  const updateSearch = (nextSearch: typeof search, mode: SearchUpdateMode = "replace") => {
    void navigateToSearch(nextSearch, mode);
  };

  return (
    <>
      <Seo {...SEO_PAGES.builder} />
      <BuilderPage
        search={search}
        onTargetInputChange={(value) => updateSearch(setBuilderTargetInput(search, value))}
        onTargetChange={(value) => updateSearch(setBuilderTarget(search, value), "push")}
        onPassivesChange={(value) => updateSearch(setBuilderPassives(search, value), "push")}
        onPassiveQueryChange={(value) => updateSearch(setBuilderPassiveQuery(search, value))}
        onAllowsExtraPassivesChange={(value) => updateSearch(setBuilderAllowsExtraPassives(search, value), "push")}
        onObjectiveChange={(value) => updateSearch(setBuilderObjective(search, value), "push")}
        onHistorySelect={(entry) => {
          const restoredSearch = builderHistoryEntryToSearch(entry);
          builderHistoryService.record(restoredSearch);
          updateSearch(restoredSearch, "push");
        }}
        onRun={() => {
          builderHistoryService.record(search);
          void navigateToSearch(runBuilderSearch(search), "push");
        }}
      />
    </>
  );
}
