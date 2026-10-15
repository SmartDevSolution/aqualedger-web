import {readFile, writeFile} from 'node:fs/promises';
const dir = new URL('../docs/ui-evidence/issue-27/rework/', import.meta.url);
const before = JSON.parse(await readFile(new URL('before-geometry.json', dir)));
const after = JSON.parse(await readFile(new URL('capture-measurements.json', dir)));
const rows = after.filter(row => row.viewport.width >= 1024).map(row => {
  const prior = before.find(item => item.name === row.name);
  const extract = item => ({columns: item.geometry.columns.map(column => ({class: column.class, widthPx: column.bounds.width, widthPercent: column.widthPercent})), mapWidthPx: item.geometry.map.width, railWidthPx: item.geometry.rail.width, cardWidthPx: item.geometry.card.width, decisionBottomY: item.geometry.decision.bottom, horizontalOverflow: item.geometry.horizontalOverflow});
  return {name: row.name, viewport: row.viewport, before: extract(prior), after: extract(row)};
});
await writeFile(new URL('geometry-before-after.json', dir), `${JSON.stringify({baseline: '30d0057dad731843612bcb5e40554892224aa0c9', fixture: 'Labelled local browser fixtures, not scientific acceptance', rows}, null, 2)}\n`);
for (const row of rows) console.log(row.name, JSON.stringify({before: row.before, after: row.after}));
