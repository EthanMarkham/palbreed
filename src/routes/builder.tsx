import { createFileRoute, useNavigate } from "@tanstack/react-router";
import BuilderPage from "../features/builder/BuilderPage";
import {
  runBuilderSearch,
  setBuilderAnyPassives,
  setBuilderExtras,
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
  const updateSearch = (nextSearch: typeof search, mode: SearchUpdateMode = "replace") => {
    void navigate({ to: ".", search: nextSearch, replace: shouldReplaceSearch(mode) });
  };

  return (
    <BuilderPage
      search={search}
      onTargetInputChange={(value) => updateSearch(setBuilderTargetInput(search, value))}
      onTargetChange={(value) => updateSearch(setBuilderTarget(search, value), "push")}
      onPassivesChange={(value) => updateSearch(setBuilderPassives(search, value), "push")}
      onAnyPassivesChange={(value) => updateSearch(setBuilderAnyPassives(search, value), "push")}
      onPassiveQueryChange={(value) => updateSearch(setBuilderPassiveQuery(search, value))}
      onObjectiveChange={(value) => updateSearch(setBuilderObjective(search, value), "push")}
      onExtrasChange={(value) => updateSearch(setBuilderExtras(search, value), "push")}
      onRun={() => updateSearch(runBuilderSearch(search), "push")}
    />
  );
}
