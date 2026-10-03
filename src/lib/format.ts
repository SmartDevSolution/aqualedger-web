// Digit policy (A38), fixed once: every number and date the workspace formats uses Latin digits
// (`-nu-latn`) in both locales and the Gregorian calendar, so the same analysis shows the same
// figures under `en` and `ar` and CLDR defaults for `ar` cannot silently switch to Eastern Arabic
// numerals. Ids, hashes and source names are never formatted; they are shown verbatim, isolated.
const NUMBERING = '-u-nu-latn';
const GREGORIAN = '-u-ca-gregory-nu-latn';

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(`${locale}${NUMBERING}`, {maximumFractionDigits: 1}).format(value);
}

export function formatValue(value: number, locale: string, maximumFractionDigits = 3): string {
  return new Intl.NumberFormat(`${locale}${NUMBERING}`, {maximumFractionDigits}).format(value);
}

export function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(`${locale}${NUMBERING}`, {style: 'percent', maximumFractionDigits: 1}).format(value);
}

export function formatGregorianDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(`${locale}${GREGORIAN}`, {
    dateStyle: 'medium',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`));
}

export function formatTimestamp(value: string, locale: string): string {
  return new Intl.DateTimeFormat(`${locale}${GREGORIAN}`, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

/** A UTC timestamp for the card and print header/footer: stable regardless of the viewer's zone. */
export function formatUtcTimestamp(value: string, locale: string): string {
  return new Intl.DateTimeFormat(`${locale}${GREGORIAN}`, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC'
  }).format(new Date(value));
}
