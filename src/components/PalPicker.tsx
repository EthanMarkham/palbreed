import {
  Button,
  ComboBox,
  Group,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  type Key,
} from "react-aria-components";
import type { Pal, PalId } from "../domain/pal";

type PalPickerProps = {
  label: string;
  description: string;
  selectedId?: PalId;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSelectionChange: (value: PalId | undefined) => void;
  pals: readonly Pal[];
  placeholder: string;
};

export default function PalPicker({
  label,
  description,
  selectedId,
  inputValue,
  onInputChange,
  onSelectionChange,
  pals,
  placeholder,
}: PalPickerProps) {
  const selected = pals.find((pal) => pal.id === selectedId);
  const filteredPals = filterPals(pals, inputValue);

  const handleSelectionChange = (key: Key | null) => {
    onSelectionChange(typeof key === "string" ? key : undefined);
  };

  return (
    <ComboBox<Pal>
      className="pal-picker"
      items={filteredPals}
      selectedKey={selectedId ?? null}
      onSelectionChange={handleSelectionChange}
      inputValue={inputValue}
      onInputChange={onInputChange}
      menuTrigger="focus"
      allowsEmptyCollection
      allowsCustomValue
    >
      <div className="picker-label-row">
        <Label>{label}</Label>
        <span>{description}</span>
      </div>
      <Group className={`picker-field${selected ? " has-image" : ""}`}>
        {selected && <img src={selected.image} alt="" />}
        <Input
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        <Button aria-label={`Show ${label.toLocaleLowerCase()} options`}>
          <ChevronIcon />
        </Button>
      </Group>
      <Popover
        className="pal-picker-popover"
        placement="bottom start"
        offset={8}
        maxHeight={480}
        shouldFlip
      >
        <ListBox<Pal>
          className="picker-options"
          renderEmptyState={() => (
            <div className="picker-empty">
              <strong>No matching Pal</strong>
              <span>Try another Pal name or number.</span>
            </div>
          )}
        >
          {(pal) => (
            <ListBoxItem
              id={pal.id}
              textValue={pal.name}
              className="picker-option"
            >
              {({ isSelected }) => (
                <>
                  <div className="picker-option-head">
                    <span className="picker-option-badge">
                      {formatPalNumber(pal.number)}
                    </span>
                    <span className="picker-option-check" aria-hidden="true">
                      {isSelected && <CheckIcon />}
                    </span>
                  </div>
                  <div className="picker-option-body">
                    <div className="picker-option-media">
                      <img src={pal.image} alt="" loading="lazy" />
                    </div>
                    <span className="picker-option-copy">
                      <strong>{pal.name}</strong>
                      <small>{formatPalMeta(pal.id)}</small>
                    </span>
                  </div>
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

function filterPals(pals: readonly Pal[], inputValue: string) {
  const query = inputValue.trim().toLocaleLowerCase();
  if (!query) return pals;

  return pals.filter((pal) => {
    const searchable = [
      pal.name,
      pal.id,
      String(pal.number),
      String(pal.number).padStart(3, "0"),
    ];

    return searchable.some((value) =>
      value.toLocaleLowerCase().includes(query),
    );
  });
}

function formatPalNumber(number: number) {
  return `No. ${String(number).padStart(3, "0")}`;
}

function formatPalMeta(palId: string) {
  return palId.split("-").join(" / ").toLocaleUpperCase();
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 12 4 4 8-9" />
    </svg>
  );
}
