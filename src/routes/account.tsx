import { createFileRoute, useNavigate } from "@tanstack/react-router";
import AccountPage from "../features/account/AccountPage";

type AccountSearch = { invite?: string };

export const Route = createFileRoute("/account")({
  validateSearch: (search: Record<string, unknown>): AccountSearch => ({
    invite: typeof search.invite === "string" && /^[a-f0-9]{48}$/.test(search.invite)
      ? search.invite
      : undefined,
  }),
  component: AccountRoute,
});

function AccountRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <AccountPage
      inviteToken={search.invite}
      onInviteAccepted={() => void navigate({ to: ".", search: {}, replace: true })}
    />
  );
}
