import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../features/legal/PolicyPage";

export const Route = createFileRoute("/legal")({ component: LegalPage });
