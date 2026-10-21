/** Converte "R$ 1.197,90" / "1197.90" / 1197.9 em número. */
export function parseBrl(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const cleaned = value.replace(/[^\d,.]/g, "");
  if (!cleaned) return undefined;
  // Formato brasileiro (vírgula decimal) quando há vírgula
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}
