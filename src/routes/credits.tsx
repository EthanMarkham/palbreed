import { createFileRoute } from "@tanstack/react-router";
import { CreditsPage } from "../features/legal/PolicyPage";

export const Route = createFileRoute("/credits")({ component: CreditsPage });
