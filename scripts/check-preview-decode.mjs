import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {boundsToImageCoordinates, decodePreviewImage, statusFromPreviewErrorCode} from '../src/lib/preview/geotiff-overlay.ts';
import {utmToWgs84} from '../src/lib/preview/utm.ts';

// A standalone, plain-Node check (no browser, no MapLibre) of the two pure pieces DP-4 P1(b)/(c)
// depend on: decoding the backend's RGBA GeoTIFF artifact bytes, and placing its recorded
// bounds/CRS onto the map without a general-purpose reprojection dependency. Run directly against
// the same fixture GeoTIFF the Playwright suite uses (tests/fixtures/ndvi-preview-fixture.tif), so
// a regression in either function fails a fast, deterministic check before any browser is involved.

const fixturePath = fileURLToPath(new URL('../tests/fixtures/ndvi-preview-fixture.tif', import.meta.url));
const fixtureBuffer = await readFile(fixturePath);
const fixtureArrayBuffer = fixtureBuffer.buffer.slice(fixtureBuffer.byteOffset, fixtureBuffer.byteOffset + fixtureBuffer.byteLength);

const decoded = await decodePreviewImage(fixtureArrayBuffer);
assert.equal(decoded.width, 2, 'fixture width');
assert.equal(decoded.height, 2, 'fixture height');
assert.deepEqual(
  Array.from(decoded.rgba),
  [
    255, 0, 0, 255, // top-left: opaque red
    0, 255, 0, 255, // top-right: opaque green
    0, 0, 255, 0, // bottom-left: transparent (masked) blue
    255, 255, 0, 255 // bottom-right: opaque yellow
  ],
  'decoded RGBA must be the artifact\'s own bytes, unmodified and not recolored'
);

// Grid origin from the ratified M1 contract freeze (11-M1-CONTRACT-FREEZE.md, B13): easting
// 418700, northing 1450520, EPSG:32638 (UTM 38N), inside the Aden-Tuban AOI (~44.25E, 13.12N).
// A small square around it exercises all four corners of `boundsToImageCoordinates`.
const realisticBounds = {minx: 418700, miny: 1450500, maxx: 418900, maxy: 1450520};
const coordinates = boundsToImageCoordinates(realisticBounds, 'EPSG:32638');
assert.ok(coordinates, 'a WGS84 UTM north CRS must be placeable');
for (const [lon, lat] of coordinates) {
  assert.ok(Number.isFinite(lon) && lon > 44.2 && lon < 44.3, `longitude ${lon} out of expected range`);
  assert.ok(Number.isFinite(lat) && lat > 13.1 && lat < 13.2, `latitude ${lat} out of expected range`);
}
const [topLeft, topRight, bottomRight, bottomLeft] = coordinates;
assert.ok(topLeft[1] > bottomLeft[1], 'top-left must be north of bottom-left');
assert.ok(topRight[0] > topLeft[0], 'top-right must be east of top-left');
assert.ok(bottomRight[1] > 0 === bottomLeft[1] > 0, 'sanity: both bottom corners are in the same hemisphere');

assert.equal(utmToWgs84(500000, 0, 'EPSG:4326'), null, 'a non-UTM CRS must be reported as unsupported, never guessed');
assert.equal(utmToWgs84(500000, 0, 'not-a-crs'), null, 'a malformed CRS string must be reported as unsupported');
assert.equal(boundsToImageCoordinates(realisticBounds, null), null, 'a null CRS must be reported as unsupported');

assert.equal(statusFromPreviewErrorCode('PREVIEW_NOT_READY'), 'notReady', 'a running/queued analysis reads as not-ready');
assert.equal(
  statusFromPreviewErrorCode('PREVIEW_NOT_READY', {execution_status: 'FAILED'}),
  'notReadyFailed',
  'a FAILED run must not read as still running'
);
assert.equal(statusFromPreviewErrorCode('PREVIEW_ARTIFACT_MISSING'), 'noArtifact');
assert.equal(
  statusFromPreviewErrorCode('PREVIEW_ARTIFACT_NOT_READY'),
  'artifactNotReady',
  'a not-yet-ready artifact must stay distinct from a missing one'
);
assert.equal(
  statusFromPreviewErrorCode('PREVIEW_URL_UNAVAILABLE'),
  'urlUnavailable',
  'a ready artifact with no signed URL must stay distinct from a not-ready artifact'
);
assert.equal(statusFromPreviewErrorCode('PREVIEW_FETCH_FAILED'), 'fetchFailed');
assert.equal(statusFromPreviewErrorCode('PREVIEW_RESULT_UNAVAILABLE'), 'resultUnavailable');
assert.equal(statusFromPreviewErrorCode('PREVIEW_NOT_CONFIGURED'), 'notConfigured');
assert.equal(statusFromPreviewErrorCode('anything-unrecognized'), 'fetchFailed');

// A malformed/undecodable TIFF must fail loudly (an honest decode failure), never silently render
// blank or garbage pixels.
await assert.rejects(() => decodePreviewImage(new ArrayBuffer(16)), 'garbage bytes must fail to decode');

process.stdout.write('check-preview-decode: PASS — fixture GeoTIFF decodes to its exact RGBA bytes; UTM placement and CRS/error-code mapping behave as documented.\n');
