export type MapFailureStage =
  | 'module-import'
  | 'worker-configuration'
  | 'map-construction'
  | 'map-controls'
  | 'map-runtime'
  | 'drawing-construction'
  | 'drawing-start'
  | 'drawing-sync';

export function mapErrorCategory(error: unknown): string {
  // Only fixed categories leave this boundary. Never log exception text or event payloads.
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'TypeError': return 'type-error';
    case 'SyntaxError': return 'syntax-error';
    case 'SecurityError': return 'security-error';
    case 'NetworkError': return 'network-error';
    case 'AbortError': return 'aborted';
    default: return 'other-error';
  }
}

export function reportMapFailure(stage: MapFailureStage, error: unknown): void {
  console.error('[AquaLedger map]', {stage, category: mapErrorCategory(error)});
}
