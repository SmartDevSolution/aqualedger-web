export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {maximumFractionDigits: 1}).format(value);
}
