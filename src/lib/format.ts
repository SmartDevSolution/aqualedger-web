export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {maximumFractionDigits: 1}).format(value);
}

export function formatValue(value: number, locale: string, maximumFractionDigits = 3): string {
  return new Intl.NumberFormat(locale, {maximumFractionDigits}).format(value);
}

export function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {style: 'percent', maximumFractionDigits: 1}).format(value);
}

export function formatGregorianDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(`${locale}-u-ca-gregory`, {
    dateStyle: 'medium',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`));
}

export function formatTimestamp(value: string, locale: string): string {
  return new Intl.DateTimeFormat(`${locale}-u-ca-gregory`, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}
