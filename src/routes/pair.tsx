import { createFileRoute } from "@tanstack/react-router";
import PairPage from "../features/pair/PairPage";

export const Route = createFileRoute("/pair")({ component: PairPage });
