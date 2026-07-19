import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "../features/legal/PolicyPage";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });
