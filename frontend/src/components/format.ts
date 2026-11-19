export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/** Signed contribution in score points; tiny values read as 0.00. */
export function signed(n: number): string {
  if (Math.abs(n) < 0.005) return '0.00';
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`;
}
