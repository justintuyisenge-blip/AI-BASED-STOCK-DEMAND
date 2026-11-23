/**
 * Format an integer amount in Rwandan Francs (RWF).
 * Whole numbers only, no decimals, shown like "RWF 12,500".
 */
export function formatRWF(amount: number): string {
  const wholeAmount = Math.round(amount);
  return `RWF ${wholeAmount.toLocaleString('en-US')}`;
}

