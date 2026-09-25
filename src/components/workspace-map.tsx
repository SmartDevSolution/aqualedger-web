'use client';

import {useEffect, useRef, useState} from 'react';
import {useTranslations} from 'next-intl';
import type {AoiPolygon} from '@/lib/analysis-input';
import {
  boundsToImageCoordinates,
  decodePreviewImage,
  statusFromPreviewErrorCode,
  type PreviewOverlayRequest,
  type PreviewOverlayStatus
} from '@/lib/preview/geotiff-overlay';

type MapStatus = 'loading' | 'ready' | 'failed';

const PREVIEW_SOURCE_ID = 'ndvi-preview-source';
const PREVIEW_LAYER_ID = 'ndvi-preview-layer';

type WorkspaceMapProps = {
  geometry: AoiPolygon | null;
  drawingEnabled: boolean;
  onGeometryChange: (geometry: AoiPolygon | null) => void;
  onDrawingFinished: () => void;
  onStatusChange: (status: MapStatus) => void;
  previewOverlay: PreviewOverlayRequest | null;
  onPreviewOverlayStatusChange: (status: PreviewOverlayStatus) => void;
};

export default function WorkspaceMap({
  geometry,
  drawingEnabled,
  onGeometryChange,
  onDrawingFinished,
  onStatusChange,
  previewOverlay,
  onPreviewOverlayStatusChange
}: WorkspaceMapProps) {
  const t = useTranslations('workspace');
  const containerRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<import('terra-draw').TerraDraw | null>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const geometryRef = useRef(geometry);
  const drawingEnabledRef = useRef(drawingEnabled);
  const callbacksRef = useRef({onGeometryChange, onDrawingFinished, onStatusChange});
  const previewCallbackRef = useRef(onPreviewOverlayStatusChange);
  const [status, setStatus] = useState<MapStatus>('loading');

  useEffect(() => {
    geometryRef.current = geometry;
    drawingEnabledRef.current = drawingEnabled;
    callbacksRef.current = {onGeometryChange, onDrawingFinished, onStatusChange};
    previewCallbackRef.current = onPreviewOverlayStatusChange;
  }, [geometry, drawingEnabled, onGeometryChange, onDrawingFinished, onStatusChange, onPreviewOverlayStatusChange]);

  useEffect(() => {
    let disposed = false;
    let map: import('maplibre-gl').Map | null = null;
    let drawReady = false;
    let activeDraw: import('terra-draw').TerraDraw | null = null;

    function updateStatus(nextStatus: MapStatus) {
      setStatus(nextStatus);
      callbacksRef.current.onStatusChange(nextStatus);
    }

    async function initialize() {
      try {
        const [maplibreModule, terraDrawModule, adapterModule] = await Promise.all([
          import('maplibre-gl'),
          import('terra-draw'),
          import('terra-draw-maplibre-gl-adapter')
        ]);
        if (disposed || !containerRef.current) {
          return;
        }

        maplibreModule.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
        map = new maplibreModule.Map({
          container: containerRef.current,
          // DP-4 P2 (Council issue #8): a same-origin, self-hosted minimal style — no external
          // basemap tile/vector/raster provider is used in M1 (see public/basemap/style.json).
          style: '/basemap/style.json',
          center: [0, 0],
          zoom: 1.4,
          attributionControl: {compact: false},
          cooperativeGestures: true,
          // W7.4: lets a test read back actual rendered pixels via WebGL `readPixels` instead of
          // asserting on implementation-private state — without it the drawing buffer may already
          // be cleared by the time a test can inspect it, making a real render/no-render
          // regression impossible to observe from outside the component.
          canvasContextAttributes: {preserveDrawingBuffer: true},
          // DP-4 W6.4: MapLibre's own default control tooltips/gesture hint are English; this
          // patches every one this app surfaces (zoom, compass reset, cooperative-gesture hint)
          // from the message catalogues so both locales are actually localized, not just menus.
          locale: {
            'NavigationControl.ZoomIn': t('mapControlZoomIn'),
            'NavigationControl.ZoomOut': t('mapControlZoomOut'),
            'NavigationControl.ResetBearing': t('mapControlResetBearing'),
            'CooperativeGesturesHandler.WindowsHelpText': t('mapGestureHintWindows'),
            'CooperativeGesturesHandler.MacHelpText': t('mapGestureHintMac'),
            'CooperativeGesturesHandler.MobileHelpText': t('mapGestureHintMobile')
          }
        });
        mapRef.current = map;
        // W7.4 (DP-4 P1(c) non-vacuity): the only production-side test hook this component
        // exposes — lets Playwright inspect the real MapLibre instance (layer/source presence,
        // projected placement, rendered pixels) instead of an implementation-private variable a
        // regression could keep alive. Never read by application code itself.
        (window as unknown as {__AQUALEDGER_TEST_MAP__?: import('maplibre-gl').Map}).__AQUALEDGER_TEST_MAP__ = map;
        map.getCanvas().setAttribute('aria-label', t('mapHeading'));
        map.getCanvas().setAttribute('role', 'application');
        map.addControl(new maplibreModule.NavigationControl({showCompass: true}), 'top-right');
        map.on('error', () => {
          if (!disposed) {
            updateStatus('failed');
          }
        });

        map.once('load', () => {
          if (disposed || !map) {
            return;
          }
          try {
            const draw = new terraDrawModule.TerraDraw({
              adapter: new adapterModule.TerraDrawMapLibreGLAdapter({map}),
              modes: [
                new terraDrawModule.TerraDrawPolygonMode(),
                new terraDrawModule.TerraDrawRenderMode({modeName: 'render', styles: {}})
              ]
            });
            activeDraw = draw;
            drawRef.current = draw;

            draw.on('ready', () => {
              if (disposed) {
                return;
              }
              drawReady = true;
              syncGeometry();
              draw.setMode(drawingEnabledRef.current ? 'polygon' : 'render');
              updateStatus('ready');
            });
            draw.on('finish', () => {
              if (disposed) {
                return;
              }
              const feature = draw.getSnapshot().find((item) => item.geometry.type === 'Polygon');
              if (feature?.geometry.type === 'Polygon') {
                callbacksRef.current.onGeometryChange(feature.geometry);
                callbacksRef.current.onDrawingFinished();
              }
              draw.setMode('render');
            });
            draw.start();
          } catch {
            updateStatus('failed');
          }
        });
      } catch {
        if (!disposed) {
          updateStatus('failed');
        }
      }
    }

    function syncGeometry() {
      if (!drawReady || !activeDraw) {
        return;
      }
      const existing = activeDraw.getSnapshot().find((item) => item.geometry.type === 'Polygon');
      const requested = geometryRef.current;
      if (sameGeometry(existing?.geometry.type === 'Polygon' ? existing.geometry : null, requested)) {
        return;
      }
      activeDraw.clear();
      if (requested) {
        activeDraw.addFeatures([{
          type: 'Feature',
          id: 'workspace-aoi',
          properties: {mode: 'polygon'},
          geometry: requested
        }]);
      }
      activeDraw.setMode(drawingEnabledRef.current ? 'polygon' : 'render');
    }

    void initialize();
    return () => {
      disposed = true;
      activeDraw?.stop();
      drawRef.current = null;
      mapRef.current = null;
      delete (window as unknown as {__AQUALEDGER_TEST_MAP__?: import('maplibre-gl').Map}).__AQUALEDGER_TEST_MAP__;
      map?.remove();
    };
  }, [t]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) {
      return;
    }
    if (geometry) {
      const existing = draw.getSnapshot().find((item) => item.geometry.type === 'Polygon');
      if (!sameGeometry(existing?.geometry.type === 'Polygon' ? existing.geometry : null, geometry)) {
        draw.clear();
        draw.addFeatures([{
          type: 'Feature',
          id: 'workspace-aoi',
          properties: {mode: 'polygon'},
          geometry
        }]);
      }
    } else if (draw.getSnapshot().length > 0) {
      draw.clear();
    }
    draw.setMode(drawingEnabled ? 'polygon' : 'render');
  }, [geometry, drawingEnabled]);

  // DP-4 P1(a)/(b): once bytes are available from the same-origin preview route, decode and
  // render them as an overlay positioned from the artifact's own recorded bounds/CRS. Every branch
  // reports one honest `PreviewOverlayStatus` and never leaves a stale layer behind.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') {
      return;
    }

    removePreviewOverlay(map);

    if (!previewOverlay) {
      previewCallbackRef.current('idle');
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    previewCallbackRef.current('loading');

    (async () => {
      let response: Response;
      try {
        response = await fetch(`/api/analyses/${encodeURIComponent(previewOverlay.analysisId)}/preview`, {
          signal: controller.signal,
          cache: 'no-store'
        });
      } catch {
        if (!cancelled) previewCallbackRef.current('fetchFailed');
        return;
      }
      // The route answers every non-artifact outcome — including the backend's own frozen `200
      // PREVIEW_NOT_READY` envelope (DP-4 P1(a)/(c)) — as `Content-Type: application/json`, never
      // as image bytes. That must be checked before decoding, not inferred from `response.ok`
      // alone: a `200` JSON envelope is `ok` but is never TIFF bytes, and treating it as such
      // reports a fabricated decode failure for a condition that is not a decode failure.
      const contentType = response.headers.get('content-type') ?? '';
      const isJsonEnvelope = contentType.split(';')[0]?.trim() === 'application/json';
      if (!response.ok || isJsonEnvelope) {
        const body: unknown = await response.json().catch(() => null);
        const code = isErrorEnvelope(body) ? body.error.code : 'PREVIEW_FETCH_FAILED';
        const params = isErrorEnvelope(body) ? body.error.params : undefined;
        if (!cancelled) previewCallbackRef.current(statusFromPreviewErrorCode(code, params));
        return;
      }

      const coordinates = boundsToImageCoordinates(previewOverlay.bounds, previewOverlay.crs);
      if (!coordinates) {
        if (!cancelled) previewCallbackRef.current('crsUnsupported');
        return;
      }

      let decoded: Awaited<ReturnType<typeof decodePreviewImage>>;
      try {
        const bytes = await response.arrayBuffer();
        decoded = await decodePreviewImage(bytes);
      } catch {
        if (!cancelled) previewCallbackRef.current('decodeFailed');
        return;
      }
      if (cancelled) {
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = decoded.width;
      canvas.height = decoded.height;
      const context = canvas.getContext('2d');
      if (!context) {
        previewCallbackRef.current('decodeFailed');
        return;
      }
      context.putImageData(new ImageData(decoded.rgba, decoded.width, decoded.height), 0, 0);

      removePreviewOverlay(map);
      map.addSource(PREVIEW_SOURCE_ID, {type: 'canvas', canvas, coordinates, animate: false});
      map.addLayer({id: PREVIEW_LAYER_ID, type: 'raster', source: PREVIEW_SOURCE_ID});
      previewCallbackRef.current('ready');
    })();

    return () => {
      cancelled = true;
      controller.abort();
      removePreviewOverlay(map);
    };
  }, [previewOverlay, status]);

  return (
    <div className="map-canvas-wrap" dir="ltr">
      <div ref={containerRef} className="map-canvas" data-testid="map-canvas" />
      {status === 'loading' ? <div className="map-state map-state-loading" role="status">{t('mapLoading')}</div> : null}
      {status === 'failed' ? (
        <div className="map-state map-state-error" role="alert">
          <strong>{t('mapFailure')}</strong>
          <span>{t('mapFailureDetail')}</span>
        </div>
      ) : null}
    </div>
  );
}

function sameGeometry(left: AoiPolygon | null, right: AoiPolygon | null): boolean {
  return JSON.stringify(left?.coordinates ?? null) === JSON.stringify(right?.coordinates ?? null);
}

function removePreviewOverlay(map: import('maplibre-gl').Map): void {
  if (map.getLayer(PREVIEW_LAYER_ID)) {
    map.removeLayer(PREVIEW_LAYER_ID);
  }
  if (map.getSource(PREVIEW_SOURCE_ID)) {
    map.removeSource(PREVIEW_SOURCE_ID);
  }
}

function isErrorEnvelope(value: unknown): value is {error: {code: string; params: Record<string, unknown>}} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as {error: unknown}).error === 'object' &&
    (value as {error: unknown}).error !== null &&
    typeof (value as {error: {code: unknown}}).error.code === 'string' &&
    typeof (value as {error: {params: unknown}}).error.params === 'object' &&
    (value as {error: {params: unknown}}).error.params !== null
  );
}
