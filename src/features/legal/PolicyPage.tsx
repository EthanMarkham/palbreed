import { Link } from "@tanstack/react-router";
import { runtimeConfig } from "../../config/runtimeConfig";

export function PrivacyPage() {
  return (
    <PolicyShell title="Privacy" index="05">
      <PolicySection title="Local use">
        <p>Palpath assigns a random device identifier and stores imported inventory in browser storage. Save files are parsed locally and are never uploaded. If you turn on automatic refresh, Palpath also stores the read-only folder permission you selected until you disconnect that world or clear the site’s data.</p>
      </PolicySection>
      <PolicySection title="Optional search history">
        <p>Palpath can keep your eight most recent Builder searches. Before sign-in, they are tied to a random session cookie; after sign-in, they are tied to your account. Aggregate search counts may be used to improve Palpath.</p>
      </PolicySection>
      <PolicySection title="Your choices">
        <p>You can use Palpath without an account, remove local worlds from Inventory, clear recent Builder searches, and request deletion of server-side search history from the site operator.</p>
      </PolicySection>
    </PolicyShell>
  );
}

export function LegalPage() {
  return (
    <PolicyShell
      title="Legal & licenses"
      description="Project terms, licenses, and warranty information."
      index="06"
    >
      <PolicySection title="Unofficial project">
        <p>Palpath is an independent, unofficial fan utility. It is not endorsed by, sponsored by, or affiliated with Pocketpair, Inc. Palworld and related names, characters, imagery, and game data belong to their respective rights holders.</p>
      </PolicySection>
      <PolicySection title="Third-party software">
        <p>Palpath includes open-source software under its respective licenses. The notices for this build identify each package and license.</p>
        <p><a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`}>Read third-party notices for this build</a>.</p>
      </PolicySection>
      <PolicySection title="GPL corresponding source">
        <p>The optional save-import compatibility path includes <code>ooz-wasm</code>, distributed under GPL-3.0-or-later. Complete corresponding source for the exact deployed build, including build and interface code, must remain available while that object code is distributed.</p>
        <p>{runtimeConfig.sourceUrl
          ? <a href={runtimeConfig.sourceUrl} rel="external">Download the corresponding source for this release</a>
          : "Corresponding source is not available for this build."}</p>
      </PolicySection>
      <PolicySection title="No warranty">
        <p>Palpath is provided as a planning utility without guarantees about game outcomes, save compatibility, availability, or fitness for a particular purpose. Keep independent backups of your saves.</p>
      </PolicySection>
    </PolicyShell>
  );
}

export function CreditsPage() {
  return (
    <PolicyShell
      title="Credits"
      description="Open-source projects that make Palpath possible."
      index="04"
    >
      <PolicySection title="PalCalc">
        <p>Palpath's breeding data and combat coefficients are generated from PalCalc's database. Thank you to Tyler Camp for creating and open-sourcing this foundational Palworld calculator.</p>
        <p><a href="https://github.com/tylercamp/palcalc" rel="external">Visit tylercamp/palcalc on GitHub</a>.</p>
      </PolicySection>
      <PolicySection title="uesave-rs">
        <p>Palpath's local save import uses uesave-rs, compiled into the browser-based save parser so imported saves stay on your device.</p>
        <p><a href="https://github.com/oMaN-Rod/uesave-rs" rel="external">Visit oMaN-Rod/uesave-rs on GitHub</a>.</p>
      </PolicySection>
    </PolicyShell>
  );
}

function PolicyShell({
  title,
  description,
  index,
  children,
}: {
  title: string;
  description?: string;
  index: string;
  children: React.ReactNode;
}) {
  return (
    <main className="workspace feature-workspace policy-workspace">
      <section className="feature-hero">
        <div>
          <span className="section-kicker">PALPATH</span>
          <h1>{title}</h1>
          <p>{description ?? (title === "Privacy"
            ? "How Palpath handles saves, history, and account data."
            : "Project terms, licenses, and warranty information.")}</p>
        </div>
        <span className="hero-index">{index}</span>
      </section>
      <article className="feature-card policy-card">
        {children}
        <nav aria-label="Policy links">
          <Link to="/credits">Credits</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/legal">Legal & licenses</Link>
        </nav>
      </article>
    </main>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
