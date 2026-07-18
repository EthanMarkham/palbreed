import {
  Button,
  ComboBox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  type Key,
} from "react-aria-components/ComboBox";
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

  const handleSelectionChange = (key: Key | null) => {
    onSelectionChange(typeof key === "string" ? key : undefined);
  };

  return (
    <ComboBox<Pal>
      className="pal-picker"
      defaultItems={pals}
      selectedKey={selectedId ?? null}
      onSelectionChange={handleSelectionChange}
      inputValue={inputValue}
      onInputChange={onInputChange}
      defaultFilter={matchesPal}
      menuTrigger="focus"
      allowsEmptyCollection
      allowsCustomValue
    >
      <div className="picker-label-row">
        <Label>{label}</Label>
        <span>{description}</span>
      </div>
      <div className={`picker-field${selected ? " has-image" : ""}`}>
        {selected && <img src={selected.image} alt="" />}
        <Input
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        <Button aria-label={`Show ${label.toLocaleLowerCase()} options`}>
          <ChevronIcon />
        </Button>
      </div>
      <Popover
        className="pal-picker-popover"
        placement="bottom start"
        offset={8}
        maxHeight={360}
        shouldFlip
      >
        <ListBox<Pal>
          className="picker-options"
          renderEmptyState={() => (
            <div className="picker-empty">
              <strong>No matching Pal</strong>
              <span>Try another Pal name.</span>
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
                  <img src={pal.image} alt="" loading="lazy" />
                  <span className="picker-option-name">
                    <strong>{pal.name}</strong>
                    <small>{pal.id}</small>
                  </span>
                  {isSelected && <CheckIcon />}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

function matchesPal(textValue: string, inputValue: string) {
  const query = inputValue.trim().toLocaleLowerCase();
  return !query || textValue.toLocaleLowerCase().includes(query);
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
