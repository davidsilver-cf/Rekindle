// A share for people to read: at most 2 decimals, no trailing zeros
// (33.3333333333 → 33.33, 60 → 60). The exact figure is still used to split.
export const fmtPct = (p) => String(Math.round(Number(p) * 100) / 100);
// Dollars as typed in an allocation: $60,000,000 or $1,250.50.
export const fmtAmount = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 }));
