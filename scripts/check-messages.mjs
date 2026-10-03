import {readFile} from 'node:fs/promises';

const locales = ['en', 'ar'];
const catalogs = new Map();
for (const locale of locales) {
  catalogs.set(locale, JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')));
}

const reference = flatten(catalogs.get('en'));
const failures = [];
for (const locale of locales.slice(1)) {
  const candidate = flatten(catalogs.get(locale));
  for (const key of new Set([...reference.keys(), ...candidate.keys()])) {
    const english = reference.get(key);
    const translated = candidate.get(key);
    if (english === undefined || translated === undefined) {
      failures.push(`${locale}: missing catalog key ${key}`);
      continue;
    }
    const expectedParams = parameters(english);
    const actualParams = parameters(translated);
    if (!sameSet(expectedParams, actualParams)) {
      failures.push(`${locale}: parameter mismatch at ${key}; expected [${[...expectedParams].join(', ')}], found [${[...actualParams].join(', ')}]`);
    }
  }
}

// Every code in the pinned contract's closed M3ReasonCode enum must have an entry in each
// locale's `reasons` block, so a re-pin that adds a code fails here instead of silently reaching
// the generic fallback (M3-5 Council condition 4).
const contract = JSON.parse(await readFile(new URL('../contracts/openapi.json', import.meta.url), 'utf8'));
const reasonCodes = contract.components?.schemas?.M3ReasonCode?.enum ?? [];
if (reasonCodes.length === 0) {
  failures.push('contracts/openapi.json: M3ReasonCode enum is missing or empty');
}
for (const locale of locales) {
  const reasons = catalogs.get(locale).reasons ?? {};
  for (const code of reasonCodes) {
    if (typeof reasons[code] !== 'string' || reasons[code].trim() === '') {
      failures.push(`${locale}: reasons.${code} has no catalog entry (M3ReasonCode member)`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Catalog keys and parameters match for ${locales.join(', ')}; all ${reasonCodes.length} M3ReasonCode members have entries.\n`);
}

function flatten(value, prefix = '', output = new Map()) {
  for (const [key, entry] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === 'string') {
      output.set(fullKey, entry);
    } else if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      flatten(entry, fullKey, output);
    } else {
      throw new TypeError(`Catalog values must be strings or nested objects: ${fullKey}`);
    }
  }
  return output;
}

function parameters(message) {
  return new Set([...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)/g)].map((match) => match[1]));
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}
