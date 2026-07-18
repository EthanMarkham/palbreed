import type { Pal } from "../domain/pal";

export function filterPals(pals: readonly Pal[], inputValue: string) {
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

export function formatPalNumber(number: number) {
  return `No. ${String(number).padStart(3, "0")}`;
}

export function formatPalMeta(palId: string) {
  return palId.split("-").join(" / ").toLocaleUpperCase();
}
