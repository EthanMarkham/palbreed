import { useState, type FormEvent } from "react";
import {
  Button,
  Dialog,
  Heading,
  Label,
  Modal,
  ModalOverlay,
  Radio,
  RadioGroup,
} from "react-aria-components";
import PalSelect from "../../components/PalSelect";
import PassiveSelector from "../../components/PassiveSelector";
import type { PalGender, PalId } from "../../domain/pal";
import { createId, inventoryService } from "../../services/inventory/inventoryService";

type ManualPalDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export default function ManualPalDialog({ isOpen, onOpenChange }: ManualPalDialogProps) {
  const [speciesId, setSpeciesId] = useState<PalId>();
  const [gender, setGender] = useState<PalGender>("F");
  const [passiveIds, setPassiveIds] = useState<readonly string[]>([]);

  const resetForm = () => {
    setSpeciesId(undefined);
    setGender("F");
    setPassiveIds([]);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const addManualPal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!speciesId) return;
    inventoryService.upsertPal({
      id: createId(),
      speciesId,
      gender,
      passiveIds,
      location: "manual",
      source: "manual",
      included: true,
    });
    handleOpenChange(false);
  };

  return (
    <ModalOverlay
      className="manual-pal-modal-overlay"
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      isDismissable
    >
      <Modal className="manual-pal-modal">
        <Dialog className="manual-pal-dialog" aria-labelledby="manual-pal-title">
          <div className="manual-pal-dialog-head">
            <div>
              <span className="section-kicker">MANUAL INVENTORY</span>
              <Heading id="manual-pal-title" slot="title">Add a Pal</Heading>
              <p>Add the details you know. Exact passives make inventory plans more useful.</p>
            </div>
            <Button type="button" className="modal-close-button" onPress={() => handleOpenChange(false)} aria-label="Close add Pal dialog">
              <CloseIcon />
            </Button>
          </div>

          <form onSubmit={addManualPal}>
            <div className="manual-pal-dialog-body">
              <PalSelect label="Pal" value={speciesId} onChange={setSpeciesId} />
              <RadioGroup
                className="gender-field"
                value={gender}
                onChange={(value) => setGender(value as PalGender)}
                orientation="horizontal"
              >
                <Label>Gender</Label>
                <div className="gender-options">
                  <Radio className="gender-option is-female" value="F" aria-label="Female">
                    <span className="gender-option-mark" aria-hidden="true">♀</span>
                    <span><strong>Female</strong><small>Female Pal</small></span>
                    <CheckIcon />
                  </Radio>
                  <Radio className="gender-option is-male" value="M" aria-label="Male">
                    <span className="gender-option-mark" aria-hidden="true">♂</span>
                    <span><strong>Male</strong><small>Male Pal</small></span>
                    <CheckIcon />
                  </Radio>
                </div>
              </RadioGroup>
              <PassiveSelector label="Passives" selected={passiveIds} onChange={setPassiveIds} />
            </div>

            <div className="manual-pal-dialog-actions">
              <Button type="button" className="secondary-button" onPress={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className="primary-button" isDisabled={!speciesId}>
                Add to inventory
              </Button>
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 3.5 3.5L18 8" /></svg>;
}
