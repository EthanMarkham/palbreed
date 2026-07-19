import { Link } from "@tanstack/react-router";
import { runtimeConfig } from "../../config/runtimeConfig";

export function PrivacyPage() {
  return (
    <PolicyShell title="Privacy" index="05">
      <PolicySection title="Local use">
        <p>Palpath assigns a random device identifier and stores imported inventory in browser storage. Save files are parsed locally and are never uploaded.</p>
      </PolicySection>
      <PolicySection title="Optional account sync">
        <p>Supabase stores up to eight recent Builder searches. Before sign-in, a random session cookie keeps those searches together; the server stores only a one-way hash of its value. When you sign in, those searches move to your account. Aggregate search counts may be used to improve discovery features.</p>
        <p>When you sign in, Supabase also processes your authentication identifier, provider account metadata, profile name, workspace memberships, and the extracted world snapshots you choose to sync. A snapshot contains Pal inventory and world/player metadata, but not the original save file.</p>
        <p>Removing a synced world clears its snapshot payload after an optimistic revision check. A minimal tombstone remains to prevent another device from restoring deleted data accidentally.</p>
      </PolicySection>
      <PolicySection title="Your choices">
        <p>You can use Palpath without an account, export the local inventory cache from Account, remove synced worlds from Inventory, sign out, and request account deletion from the site operator.</p>
      </PolicySection>
      <PolicySection title="Contact">
        <p>{runtimeConfig.legalContactEmail
          ? <>For privacy or deletion requests, email <a href={`mailto:${runtimeConfig.legalContactEmail}`}>{runtimeConfig.legalContactEmail}</a>.</>
          : "This local build has no configured site-operator contact and does not enable cloud sync."}</p>
      </PolicySection>
    </PolicyShell>
  );
}

export function LegalPage() {
  return (
    <PolicyShell title="Legal & licenses" index="06">
      <PolicySection title="Unofficial project">
        <p>Palpath is an independent, unofficial fan utility. It is not endorsed by, sponsored by, or affiliated with Pocketpair, Inc. Palworld and related names, characters, imagery, and game data belong to their respective rights holders.</p>
      </PolicySection>
      <PolicySection title="Third-party software">
        <p>The production build includes open-source dependencies under their respective licenses. The release process emits the exact installed notices and license files from the lockfile.</p>
        <p><a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`}>Read third-party notices for this build</a>.</p>
      </PolicySection>
      <PolicySection title="GPL corresponding source">
        <p>The optional save-import compatibility path includes <code>ooz-wasm</code>, distributed under GPL-3.0-or-later. Complete corresponding source for the exact deployed build, including build and interface code, must remain available while that object code is distributed.</p>
        <p>{runtimeConfig.sourceUrl
          ? <a href={runtimeConfig.sourceUrl} rel="external">Download the corresponding source for this release</a>
          : "This build has no configured corresponding-source URL and must not be treated as cleared for public monetized distribution."}</p>
      </PolicySection>
      <PolicySection title="No warranty">
        <p>Palpath is provided as a planning utility without guarantees about game outcomes, save compatibility, availability, or fitness for a particular purpose. Keep independent backups of your saves.</p>
      </PolicySection>
      <PolicySection title="Contact">
        <p>{runtimeConfig.legalContactEmail
          ? <>For legal, copyright, or licensing questions, email <a href={`mailto:${runtimeConfig.legalContactEmail}`}>{runtimeConfig.legalContactEmail}</a>.</>
          : "No site-operator contact is configured in this local build."}</p>
      </PolicySection>
    </PolicyShell>
  );
}

function PolicyShell({
  title,
  index,
  children,
}: {
  title: string;
  index: string;
  children: React.ReactNode;
}) {
  return (
    <main className="workspace feature-workspace policy-workspace">
      <section className="feature-hero">
        <div>
          <span className="section-kicker">PALPATH</span>
          <h1>{title}</h1>
          <p>Plain-language product and release information for this deployment.</p>
        </div>
        <span className="hero-index">{index}</span>
      </section>
      <article className="feature-card policy-card">
        {children}
        <nav aria-label="Policy links">
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
