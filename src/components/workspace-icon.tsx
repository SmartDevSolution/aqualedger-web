import type {CSSProperties} from 'react';

const paths = {
  leaf: 'M19 3C8 3 3 8 5 15c3 6 11 5 14-12ZM5 21 16 8',
  area: 'M4 8V4h4m8 0h4v4m0 8v4h-4M8 20H4v-4M8 8h8v8H8Z',
  calendar: 'M7 3v4m10-4v4M4 10h16M4 5h16v16H4Z',
  layers: 'm12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5',
  chart: 'M4 20V12m7 8V5m7 15v-9',
  image: 'M3 3h18v18H3Zm0 14 6-7 4 5 3-3 5 6M16 7h.01',
  bulb: 'M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0l-1 4H9Z',
  search: 'M16 16 22 22M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  user: 'M4 21c0-8 16-8 16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  refresh: 'M20 8a9 9 0 0 0-15-3L2 8m0-6v6h6m-4 8a9 9 0 0 0 15 3l3-3m0 6v-6h-6',
  polygon: 'm5 5 14-2 2 14-15 4ZM5 5h.01M19 3h.01M21 17h.01M6 21h.01',
  pin: 'M12 22s8-9 8-14a8 8 0 1 0-16 0c0 5 8 14 8 14Zm3-14a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  download: 'M12 2v14m-5-5 5 5 5-5M4 21h16',
  target: 'M12 1v5m0 12v5M1 12h5m12 0h5M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  rectangle: 'M4 4h16v16H4Z',
  history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v7l4 2'
};
export function WorkspaceIcon({name, style}: {name: keyof typeof paths; style?: CSSProperties}) {
  return <svg className="workspace-icon" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
