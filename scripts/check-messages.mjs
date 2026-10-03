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

// ---------------------------------------------------------------------------------------------
// Unsupported-outcome (F1) class gate — the SECOND key family.
//
// F1 (web PR #10, f1426c2) corrected the rendered sentence in `reasons.*` only. M3-5 then
// reintroduced the same defect in `zones.unrankedGroup.*` — a family this script parity-checked
// but never checked for MEANING — where "Stress not persistent" was rendered as an UNRANKED group
// heading (zone-priority-panel.tsx:168 interposes it into `{reason} ({count})`). Both families
// render the SAME `PERSISTENCE_INELIGIBLE` code, so a wording denylist must be applied to every
// family the panel renders from that code, not to a hand-maintained list of keys.
//
// Denylisted tokens are claims the pinned backend never establishes for these codes: the F1
// eligibility gate (analysis/m2.py:73-104 "never invent a value when baseline/history is
// inadequate"; NO_COMPATIBLE_BASELINE :85, EXCESSIVE_GAPS :92, AGRICULTURAL_MASK_BLOCKED :383-391)
// emits no persistence OUTCOME, so no rendered string may assert "not persistent".
// Substring, case-insensitive — the exact-text absence check in the F1 regression missed the
// shorter duplicate wording.
const DENY_TOKENS = ['not persistent', 'غير مستمر'];
const RENDERED_REASON_FAMILIES = [
  {name: 'reasons', entries: (catalog) => catalog.reasons ?? {}},
  {name: 'zones.unrankedGroup', entries: (catalog) => catalog.zones?.unrankedGroup ?? {}}
];
for (const locale of locales) {
  const catalog = catalogs.get(locale);
  for (const family of RENDERED_REASON_FAMILIES) {
    for (const [key, value] of Object.entries(family.entries(catalog))) {
      if (typeof value !== 'string') continue;
      const lowered = value.toLowerCase();
      for (const token of DENY_TOKENS) {
        if (lowered.includes(token.toLowerCase())) {
          failures.push(`${locale}: ${family.name}.${key} contains the unsupported-claim token "${token}"; the pinned backend establishes no persistence outcome for this code (F1 class)`);
        }
      }
    }
  }
}

// The panel's own group keys (src/components/zone-priority-panel.tsx `GROUP_KEYS`) are the only
// codes it can turn into an `unrankedGroup.*` heading. Read them from the source so the gate
// follows the code instead of a second hand-maintained list:
//   - every GROUP_KEYS member needs a non-empty entry in BOTH locales (a missing one falls through
//     to the `_other` heading and silently drops the reason);
//   - every GROUP_KEYS member must be a member of the pinned M3ReasonCode enum (a group key the
//     backend cannot emit is dead copy that can only mislead);
//   - the family may hold no non-`_other` key outside GROUP_KEYS (unreachable duplicate entries are
//     how the F1b defect survived a family-wide parity check), and `_other` must exist.
const panelSource = await readFile(new URL('../src/components/zone-priority-panel.tsx', import.meta.url), 'utf8');
const groupKeys = groupKeysFromPanel(panelSource);
if (groupKeys.length === 0) {
  failures.push('src/components/zone-priority-panel.tsx: GROUP_KEYS could not be read; the unrankedGroup class gate cannot verify the panel');
} else {
  for (const locale of locales) {
    const family = catalogs.get(locale).zones?.unrankedGroup ?? {};
    for (const key of groupKeys) {
      if (typeof family[key] !== 'string' || family[key].trim() === '') {
        failures.push(`${locale}: zones.unrankedGroup.${key} has no catalog entry (panel GROUP_KEYS member)`);
      }
    }
    if (typeof family._other !== 'string' || family._other.trim() === '') {
      failures.push(`${locale}: zones.unrankedGroup._other has no catalog entry (panel fallback)`);
    }
    for (const key of Object.keys(family)) {
      if (key !== '_other' && !groupKeys.includes(key)) {
        failures.push(`${locale}: zones.unrankedGroup.${key} is not a panel GROUP_KEYS member; it can never be rendered (dead duplicate entry)`);
      }
    }
  }
  for (const key of groupKeys) {
    if (reasonCodes.length > 0 && !reasonCodes.includes(key)) {
      failures.push(`src/components/zone-priority-panel.tsx: GROUP_KEYS member ${key} is not an M3ReasonCode member; the pinned backend cannot emit it`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Catalog keys and parameters match for ${locales.join(', ')}; all ${reasonCodes.length} M3ReasonCode members have entries; ${groupKeys.length} panel group keys are covered in both locales and free of unsupported-outcome tokens (${DENY_TOKENS.length} denylisted).\n`);
}

// `const GROUP_KEYS = ['A', 'B', ...] as const;` — the array literal only, so a rename or a
// structural change fails the check above instead of passing silently.
function groupKeysFromPanel(source) {
  const match = source.match(/const GROUP_KEYS\s*=\s*\[([\s\S]*?)\]\s*as const;/);
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
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
