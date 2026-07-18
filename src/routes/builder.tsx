import { createFileRoute } from "@tanstack/react-router";
import BuilderPage from "../features/builder/BuilderPage";

export const Route = createFileRoute("/builder")({ component: BuilderPage });
