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
  value: PalId;
  onChange: (value: PalId) => void;
  pals: readonly Pal[];
  placeholder: string;
};

export default function PalPicker({
  label,
  description,
  value,
  onChange,
  pals,
  placeholder,
}: PalPickerProps) {
  const selected = pals.find((pal) => pal.id === value);

  const handleChange = (key: Key | null) => {
    const nextId = typeof key === "string" ? key : "";
    onChange(nextId);
  };

  return (
    <ComboBox<Pal>
      className="pal-picker"
      defaultItems={pals}
      value={value || null}
      onChange={handleChange}
      defaultFilter={matchesPal}
      menuTrigger="focus"
      allowsEmptyCollection
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
