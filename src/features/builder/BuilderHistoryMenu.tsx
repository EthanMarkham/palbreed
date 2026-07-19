import {
  Button,
  Dialog,
  DialogTrigger,
  Heading,
  Popover,
} from "react-aria-components";
import PalAvatar from "../../components/PalAvatar";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import {
  builderHistoryService,
  getBuilderHistoryKey,
  type BuilderHistoryEntry,
} from "./builderHistory";
import { useBuilderHistory } from "./useBuilderHistory";

type BuilderHistoryMenuProps = {
  onSelect: (entry: BuilderHistoryEntry) => void;
};

const historyDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default function BuilderHistoryMenu({ onSelect }: BuilderHistoryMenuProps) {
  const entries = useBuilderHistory();

  return (
    <DialogTrigger>
      <Button
        className="builder-history-trigger"
        aria-label={entries.length
          ? `Open recent builds, ${entries.length} saved`
          : "Open recent builds"}
      >
        <HistoryIcon />
        {entries.length ? <span aria-hidden="true">{entries.length}</span> : null}
      </Button>
      <Popover className="builder-history-popover" placement="bottom end">
        <Dialog className="builder-history-dialog">
          <header className="builder-history-header">
            <div>
              <span>SEARCH HISTORY</span>
              <Heading slot="title">Recent builds</Heading>
            </div>
            {entries.length ? (
              <Button className="builder-history-clear" onPress={() => builderHistoryService.clear()}>
                Clear all
              </Button>
            ) : null}
          </header>

          {entries.length ? (
            <ul className="builder-history-list">
              {entries.map((entry) => (
                <HistoryRow
                  key={getBuilderHistoryKey(entry)}
                  entry={entry}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          ) : (
            <div className="builder-history-empty">
              <HistoryIcon />
              <strong>No recent builds</strong>
              <span>Routes you find will appear here.</span>
            </div>
          )}

          <p className="builder-history-note">
            Up to eight recent builds are synced. Anonymous history moves to your account when you sign in.
          </p>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

function HistoryRow({
  entry,
  onSelect,
}: {
  entry: BuilderHistoryEntry;
  onSelect: (entry: BuilderHistoryEntry) => void;
}) {
  const target = breedingRepository.getPal(entry.targetId);
  const passiveSummary = entry.passives === "any"
    ? "Passives don't matter"
    : entry.passives.map((id) => passiveRepository.get(id)?.name ?? id).join(" · ");

  return (
    <li>
      <Button slot="close" className="builder-history-entry" onPress={() => onSelect(entry)}>
        <span className="builder-history-pal">{target ? <PalAvatar pal={target} /> : null}</span>
        <span className="builder-history-copy">
          <strong>{target?.name ?? entry.targetId}</strong>
          <span>{passiveSummary}</span>
          <small>{formatSettings(entry)} · <time dateTime={entry.searchedAt}>{formatDate(entry.searchedAt)}</time></small>
        </span>
        <ChevronIcon />
      </Button>
      <Button
        className="builder-history-remove"
        aria-label={`Remove ${target?.name ?? entry.targetId} from search history`}
        onPress={() => builderHistoryService.remove(entry)}
      >
        <CloseIcon />
      </Button>
    </li>
  );
}

function formatSettings(entry: BuilderHistoryEntry) {
  const objective = entry.objective === "fewest"
    ? "Fewer breedings"
    : entry.objective === "cleanest"
      ? "Better hatch odds"
      : "Balanced route";
  if (entry.passives === "any" || entry.allowedExtras === 0) return objective;
  const extras = entry.allowedExtras === 1 ? "1 other passive allowed" : "2 other passives allowed";
  return `${objective} · ${extras}`;
}

function formatDate(value: string) {
  return historyDateFormatter.format(new Date(value));
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.1-5.6L3.5 8.5" />
      <path d="M3.5 4v4.5H8M12 7.5V12l3 1.8" />
    </svg>
  );
}

function ChevronIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7M11.5 4.5l-7 7" /></svg>;
}
