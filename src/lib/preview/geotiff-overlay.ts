import type {components} from '@/lib/api/generated';
// Explicit `.ts` extension (allowImportingTsExtensions): this module is also loaded directly by
// Node's own type-stripping loader from scripts/check-preview-decode.mjs, which — unlike
// TypeScript's "bundler" resolution used by webpack — requires a fully specified relative import.
import {utmToWgs84} from './utm.ts';

export type ArtifactBounds = components['schemas']['ArtifactBounds'];

export type PreviewOverlayRequest = {
  analysisId: string;
  bounds: ArtifactBounds;
  crs: string | null;
};

// Distinguishes every honest outcome the workspace map can report for the NDVI overlay (DP-4
// P1(c)): 'ready' means the layer is on the map; every other value means no layer is shown, for
// the stated reason, and none of them may be presented as the analysis's evidence status.
export type PreviewOverlayStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'notReady'
  | 'noArtifact'
  | 'fetchFailed'
  | 'decodeFailed'
  | 'crsUnsupported';

export type DecodedPreviewImage = {
  width: number;
  height: number;
  /** Interleaved RGBA, one byte per channel, in the artifact's own band order (R,G,B,alpha) —
   *  the backend's already-colormapped pixels (freeze B9 revised by DP-4 P1(b)): never recolored
   *  here, and alpha is the backend's mask (0 = not part of the reported observation). */
  rgba: Uint8ClampedArray<ArrayBuffer>;
};

/**
 * Maps the preview route's documented `{error: {code}}` bodies (`src/app/api/analyses/[id]/preview/route.ts`)
 * onto the honest UI states DP-4 P1(c)/P4 requires the map to distinguish. An unrecognized code is
 * treated the same as a fetch failure: no layer is shown, and nothing is guessed.
 */
export function statusFromPreviewErrorCode(code: string): PreviewOverlayStatus {
  switch (code) {
    case 'PREVIEW_NOT_READY':
      return 'notReady';
    case 'PREVIEW_ARTIFACT_MISSING':
    case 'PREVIEW_ARTIFACT_NOT_READY':
      return 'noArtifact';
    default:
      return 'fetchFailed';
  }
}

/**
 * Decodes the RGBA GeoTIFF the preview route streams (`build_ndvi_geotiff`,
 * `work/backend/src/aqualedger/analysis/artifacts.py`): 4 uint8 bands, R/G/B/alpha, no second
 * colormap application. Throws with a specific message on any shape this decoder cannot render,
 * so the caller reports an honest decode failure instead of a fabricated layer.
 */
export async function decodePreviewImage(bytes: ArrayBuffer): Promise<DecodedPreviewImage> {
  const {fromArrayBuffer} = await import('geotiff');
  const tiff = await fromArrayBuffer(bytes);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  if (image.getSamplesPerPixel() !== 4) {
    throw new Error('The preview GeoTIFF does not carry exactly four bands (RGBA).');
  }

  const raster = await image.readRasters({interleave: true});
  if (!(raster instanceof Uint8Array)) {
    throw new Error('The preview GeoTIFF bands are not 8-bit.');
  }
  if (raster.length !== width * height * 4) {
    throw new Error('The decoded preview raster length does not match its declared dimensions.');
  }

  // Copied into a fresh, concretely `ArrayBuffer`-backed array (not the decoder's own buffer type)
  // so the result is directly usable by `ImageData`, which requires `Uint8ClampedArray<ArrayBuffer>`.
  const rgba = new Uint8ClampedArray(new ArrayBuffer(raster.length));
  rgba.set(raster);
  return {width, height, rgba};
}

/**
 * Reprojects the artifact reference's recorded `bounds` (in its recorded `crs`) into the four
 * WGS84 corners a MapLibre image/canvas source needs, in [top-left, top-right, bottom-right,
 * bottom-left] order. Returns `null` when `crs` is absent or not a WGS84 UTM zone this decoder
 * supports (see `utm.ts`) — the caller must then report the CRS as unsupported, never guess a
 * placement.
 */
export function boundsToImageCoordinates(
  bounds: ArtifactBounds,
  crs: string | null
): [[number, number], [number, number], [number, number], [number, number]] | null {
  if (!crs) {
    return null;
  }
  const topLeft = utmToWgs84(bounds.minx, bounds.maxy, crs);
  const topRight = utmToWgs84(bounds.maxx, bounds.maxy, crs);
  const bottomRight = utmToWgs84(bounds.maxx, bounds.miny, crs);
  const bottomLeft = utmToWgs84(bounds.minx, bounds.miny, crs);
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
    return null;
  }
  return [
    [topLeft.lon, topLeft.lat],
    [topRight.lon, topRight.lat],
    [bottomRight.lon, bottomRight.lat],
    [bottomLeft.lon, bottomLeft.lat]
  ];
}
