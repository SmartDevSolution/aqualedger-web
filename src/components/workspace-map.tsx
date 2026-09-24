'use client';

import {useEffect, useRef, useState} from 'react';
import {useTranslations} from 'next-intl';
import type {AoiPolygon} from '@/lib/analysis-input';

type MapStatus = 'loading' | 'ready' | 'failed';

type WorkspaceMapProps = {
  geometry: AoiPolygon | null;
  drawingEnabled: boolean;
  onGeometryChange: (geometry: AoiPolygon | null) => void;
  onDrawingFinished: () => void;
  onStatusChange: (status: MapStatus) => void;
};

export default function WorkspaceMap({
  geometry,
  drawingEnabled,
  onGeometryChange,
  onDrawingFinished,
  onStatusChange
}: WorkspaceMapProps) {
  const t = useTranslations('workspace');
  const containerRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<import('terra-draw').TerraDraw | null>(null);
  const geometryRef = useRef(geometry);
  const drawingEnabledRef = useRef(drawingEnabled);
  const callbacksRef = useRef({onGeometryChange, onDrawingFinished, onStatusChange});
  const [status, setStatus] = useState<MapStatus>('loading');

  useEffect(() => {
    geometryRef.current = geometry;
    drawingEnabledRef.current = drawingEnabled;
    callbacksRef.current = {onGeometryChange, onDrawingFinished, onStatusChange};
  }, [geometry, drawingEnabled, onGeometryChange, onDrawingFinished, onStatusChange]);

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
          style: 'https://demotiles.maplibre.org/styles/osm-bright-gl-style/style.json',
          center: [0, 0],
          zoom: 1.4,
          attributionControl: {compact: false},
          cooperativeGestures: true
        });
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
