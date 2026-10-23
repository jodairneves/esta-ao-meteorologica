import { MapPinOff } from 'lucide-react';
import type { GeoJSONSource, Map as MapLibre } from 'maplibre-gl';
import { LngLatBounds, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import type { StationSummary } from '../../../common/api';
import { cssVar } from '../../lib/css';
import { withUnit } from '../../lib/format';
import { stationStatusLook } from '../../lib/status';
import { useTheme } from '../../lib/theme';
import { EmptyState } from '../ui/misc';
import { circlePolygon, createBaseMap, metersPerPixel } from './base-map';
import { MAP_METRICS, type MapMetric } from './map-metrics';

type Located = StationSummary & { latitude: number; longitude: number };

const located = (stations: StationSummary[]): Located[] =>
  stations.filter((s): s is Located => s.latitude !== null && s.longitude !== null);

/** Column footprint and tallest column, in screen pixels at the initial view. */
const COLUMN_RADIUS_PX = 9;
const COLUMN_HEIGHT_PX = 150;

interface Scale {
  radiusM: number;
  heightM: number;
}

function columnsData(stations: Located[], metric: MapMetric, scale: Scale) {
  const spec = MAP_METRICS[metric];
  const values = stations.map((station) => spec.value(station));
  const present = values.filter((value): value is number => value !== null);
  const base = Math.min(0, ...present);
  const top = Math.max(base, ...present);
  const hue = cssVar(spec.color);
  const muted = cssVar('--ink-3');

  return {
    type: 'FeatureCollection' as const,
    features: stations.map((station, index) => {
      const value = values[index] ?? null;
      const live = station.status === 'online' || station.status === 'sleeping';
      const fraction = value === null || top === base ? 0 : (value - base) / (top - base);
      return {
        type: 'Feature' as const,
        properties: {
          code: station.code,
          // A stub keeps stations without a value visible on the map.
          height: Math.max(scale.heightM * 0.03, fraction * scale.heightM),
          color: value === null || !live ? muted : hue,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [circlePolygon(station.longitude, station.latitude, scale.radiusM)],
        },
      };
    }),
  };
}

function labelHtml(element: HTMLElement, station: Located, metric: MapMetric) {
  const spec = MAP_METRICS[metric];
  const look = stationStatusLook(station.status, station.statusSeverity);
  const live = station.status === 'online' || station.status === 'sleeping';
  element.replaceChildren();
  const name = document.createElement('span');
  name.className = 'block truncate text-[13px] text-ink-2';
  name.textContent = station.name;
  const value = document.createElement('span');
  value.className = 'readout block text-[17px] text-ink';
  value.textContent = withUnit(spec.value(station), spec.unit, spec.digits);
  element.append(name, value);
  if (!live) {
    const status = document.createElement('span');
    status.className = 'block text-xs text-ink-3';
    status.textContent = look.label;
    element.append(status);
  }
  element.setAttribute('aria-label', `${station.name}: ${value.textContent}. Abrir estação`);
}

/**
 * Overview map: the base map tilted in 3D, one column per station whose height follows the
 * chosen quantity, with a direct label (name and value) next to each column.
 */
export default function StationsMap({
  stations,
  metric,
  onSelect,
}: {
  stations: StationSummary[];
  metric: MapMetric;
  onSelect: (code: string) => void;
}) {
  const { theme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const markers = useRef(new Map<string, { marker: Marker; element: HTMLButtonElement }>());
  const scaleRef = useRef<Scale | null>(null);
  const latest = useRef({ stations: located(stations), metric, onSelect });
  latest.current = { stations: located(stations), metric, onSelect };
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const hasPoints = latest.current.stations.length > 0;

  // One map per theme (each theme has its own base style).
  useEffect(() => {
    if (!container.current || !hasPoints) return;
    setReady(false);
    setFailed(false);
    const points = latest.current.stations;
    const bounds = new LngLatBounds();
    for (const station of points) bounds.extend([station.longitude, station.latitude]);

    const map = createBaseMap(
      container.current,
      theme,
      (loaded) => {
        loaded.addSource('station-columns', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        loaded.addLayer({
          id: 'station-columns',
          type: 'fill-extrusion',
          source: 'station-columns',
          paint: {
            'fill-extrusion-color': ['get', 'color'],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.92,
            'fill-extrusion-vertical-gradient': true,
          },
        });
        loaded.on('click', 'station-columns', (event) => {
          const code = event.features?.[0]?.properties?.code;
          if (typeof code === 'string') latest.current.onSelect(code);
        });
        loaded.on('mouseenter', 'station-columns', () => {
          loaded.getCanvas().style.cursor = 'pointer';
        });
        loaded.on('mouseleave', 'station-columns', () => {
          loaded.getCanvas().style.cursor = '';
        });
        setReady(true);
      },
      {
        bounds: points.length > 1 ? bounds : undefined,
        center:
          points.length === 1 ? [points[0]?.longitude ?? 0, points[0]?.latitude ?? 0] : undefined,
        zoom: points.length === 1 ? 14 : undefined,
        fitBoundsOptions: { padding: { top: 110, bottom: 60, left: 80, right: 160 }, maxZoom: 14 },
        pitch: 52,
        bearing: -14,
        maxPitch: 70,
        onStyleError: () => setFailed(true),
      },
    );
    mapRef.current = map;
    const center = map.getCenter();
    const mpp = metersPerPixel(center.lat, map.getZoom());
    scaleRef.current = { radiusM: COLUMN_RADIUS_PX * mpp, heightM: COLUMN_HEIGHT_PX * mpp };

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    const currentMarkers = markers.current;
    return () => {
      observer.disconnect();
      for (const { marker } of currentMarkers.values()) marker.remove();
      currentMarkers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [theme, hasPoints]);

  // Data updates (live readings, metric switch) only touch the source and the labels.
  useEffect(() => {
    const map = mapRef.current;
    const scale = scaleRef.current;
    if (!ready || !map || !scale) return;
    const points = located(stations);
    (map.getSource('station-columns') as GeoJSONSource | undefined)?.setData(
      columnsData(points, metric, scale),
    );

    const seen = new Set<string>();
    for (const station of points) {
      seen.add(station.code);
      let entry = markers.current.get(station.code);
      if (!entry) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className =
          'panel max-w-44 cursor-pointer bg-raised/90 px-2.5 py-1.5 text-left backdrop-blur-sm hover:border-hairline-strong';
        element.addEventListener('click', () => latest.current.onSelect(station.code));
        const marker = new Marker({ element, anchor: 'left', offset: [16, 0] })
          .setLngLat([station.longitude, station.latitude])
          .addTo(map);
        entry = { marker, element };
        markers.current.set(station.code, entry);
      }
      entry.marker.setLngLat([station.longitude, station.latitude]);
      labelHtml(entry.element, station, metric);
    }
    for (const [code, entry] of markers.current) {
      if (!seen.has(code)) {
        entry.marker.remove();
        markers.current.delete(code);
      }
    }
  }, [ready, stations, metric]);

  if (!hasPoints) {
    return (
      <EmptyState
        icon={MapPinOff}
        title="Nenhuma estação com localização"
        className="h-full justify-center"
      >
        Informe latitude e longitude no cadastro da estação para vê-la no mapa.
      </EmptyState>
    );
  }

  return (
    <div className="relative h-full overflow-hidden rounded-[9px]">
      {/* MapLibre's stylesheet makes its container position: relative, so a wrapper holds the box. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-panel/80 p-6 text-center text-sm text-ink-2">
          Não foi possível carregar o mapa base (sem internet?). Os dados das estações continuam na
          lista abaixo.
        </div>
      )}
    </div>
  );
}
