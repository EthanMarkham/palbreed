import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import "../App.css";
import { breedingRepository } from "../data/breedingRepository";

const metadata = breedingRepository.metadata;

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function RootLayout() {
  return (
    <div className="site-frame">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header">
        <div className="brand" aria-label="Palpath home">
          <span className="brand-mark">PP</span>
          <span className="brand-name">PALPATH</span>
        </div>
        <span className="version-label">Palworld {metadata.gameVersion}</span>
      </header>

      <Outlet />

      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </div>
  );
}

function NotFoundPage() {
  return (
    <main className="workspace">
      <section className="route-stage route-status is-warning">
        <div>
          <h2>Page not found</h2>
          <p>The route you requested does not exist.</p>
        </div>
      </section>
    </main>
  );
}
