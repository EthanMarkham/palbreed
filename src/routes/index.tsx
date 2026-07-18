import { createFileRoute, useNavigate } from "@tanstack/react-router";
import PlannerPage from "../features/planner/PlannerPage";
import {
  setPlannerInput,
  setPlannerSelection,
  swapPlannerSearch,
} from "../features/planner/plannerNavigation";
import { parsePlannerSearch } from "../features/planner/plannerSearch";

export const Route = createFileRoute("/")({
  validateSearch: parsePlannerSearch,
  component: PlannerRoute,
});

function PlannerRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const updateSearch = (nextSearch: typeof search, replace = true) => {
    void navigate({
      to: ".",
      search: nextSearch,
      replace,
    });
  };

  return (
    <PlannerPage
      search={search}
      onFromInputChange={(value) => updateSearch(setPlannerInput(search, "from", value))}
      onToInputChange={(value) => updateSearch(setPlannerInput(search, "to", value))}
      onFromSelectionChange={(value) => updateSearch(setPlannerSelection(search, "from", value))}
      onToSelectionChange={(value) => updateSearch(setPlannerSelection(search, "to", value))}
      onSwap={() => updateSearch(swapPlannerSearch(search), false)}
    />
  );
}
