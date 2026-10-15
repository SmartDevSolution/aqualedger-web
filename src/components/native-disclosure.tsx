'use client';

import {useId, useState, type ReactNode} from 'react';

// Native details owns keyboard and open behavior; state only mirrors its toggle
// event to expose the explicit ARIA state required by the workspace spec.
export function NativeDisclosure({className, summary, children}: {className: string; summary: ReactNode; children: ReactNode}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  return (
    <details className={className} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary aria-expanded={expanded} aria-controls={contentId}>{summary}</summary>
      <div id={contentId}>{children}</div>
    </details>
  );
}
