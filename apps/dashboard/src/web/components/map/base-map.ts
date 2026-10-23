import 'maplibre-gl/dist/maplibre-gl.css';
import './map-theme.css';
import {
  AttributionControl,
  Map as MapLibre,
  type MapOptions,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Theme } from '../../lib/theme';

// MapLibre 6 loads its worker from a separate file; Vite gives it a stable URL.
setWorkerUrl(workerUrl);

/** Free vector tiles without an API key (design §8.7). */
const STYLES: Record<Theme, string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
};

/** The base map is repainted in the interface's slate tones so the data columns lead. */
const BASE_COLORS: Record<
  Theme,
  { land: string; landcover: string; water: string; line: string; label: string; halo: string }
> = {
  dark: {
    land: '#0f1a22',
    landcover: '#122029',
    water: '#0a131a',
    line: '#2a3d4a',
    label: '#7c8b95',
    halo: '#0f1a22',
  },
  light: {
    land: '#eef2f4',
    landcover: '#e5ebee',
    water: '#d3e0e9',
    line: '#cfd9df',
    label: '#6c7b86',
    halo: '#eef2f4',
  },
};

const LOCALE: Record<string, string> = {
  'AttributionControl.ToggleAttribution': 'Mostrar ou ocultar créditos',
  'Map.Title': 'Mapa',
  'Marker.Title': 'Marcador',
  'NavigationControl.ResetBearing': 'Arraste para girar; clique para voltar ao norte',
  'NavigationControl.ZoomIn': 'Aproximar',
  'NavigationControl.ZoomOut': 'Afastar',
  'CooperativeGesturesHandler.WindowsHelpText': 'Use Ctrl + rolagem para aproximar o mapa',
  'CooperativeGesturesHandler.MacHelpText': 'Use ⌘ + rolagem para aproximar o mapa',
  'CooperativeGesturesHandler.MobileHelpText': 'Use dois dedos para mover o mapa',
};

function quietBaseMap(map: MapLibre, theme: Theme): void {
  const colors = BASE_COLORS[theme];
  for (const layer of map.getStyle().layers) {
    const id = layer.id.toLowerCase();
    switch (layer.type) {
      case 'background':
        map.setPaintProperty(layer.id, 'background-color', colors.land);
        break;
      case 'fill':
        map.setPaintProperty(
          layer.id,
          'fill-color',
          id.includes('water') ? colors.water : colors.landcover,
        );
        if (!id.includes('water')) map.setPaintProperty(layer.id, 'fill-opacity', 0.7);
        break;
      case 'fill-extrusion':
        map.setLayoutProperty(layer.id, 'visibility', 'none');
        break;
      case 'line':
        map.setPaintProperty(
          layer.id,
          'line-color',
          id.includes('water') ? colors.water : colors.line,
        );
        break;
      case 'symbol':
        map.setPaintProperty(layer.id, 'text-color', colors.label);
        map.setPaintProperty(layer.id, 'text-halo-color', colors.halo);
        map.setPaintProperty(layer.id, 'icon-opacity', 0);
        break;
    }
  }
}

export interface BaseMapOptions extends Omit<MapOptions, 'container' | 'style'> {
  onStyleError?: () => void;
}

/** A themed map with Portuguese controls; `onReady` runs once the base style is in place. */
export function createBaseMap(
  container: HTMLElement,
  theme: Theme,
  onReady: (map: MapLibre) => void,
  { onStyleError, ...options }: BaseMapOptions = {},
): MapLibre {
  const map = new MapLibre({
    container,
    style: STYLES[theme],
    attributionControl: false,
    cooperativeGestures: true,
    locale: LOCALE,
    ...options,
  });
  map.addControl(new AttributionControl({ compact: true }), 'bottom-right');
  map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');

  let ready = false;
  map.on('style.load', () => {
    quietBaseMap(map, theme);
    if (!ready) {
      ready = true;
      onReady(map);
    }
  });
  map.on('error', () => {
    // Tile hiccups are harmless; a style that never loads means no internet or no tiles.
    if (!ready) onStyleError?.();
  });
  return map;
}

/** Meters per screen pixel at a latitude and zoom (512 px tiles). */
export function metersPerPixel(latitude: number, zoom: number): number {
  return (40_075_016.686 * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** Closed ring approximating a circle of `radiusM` metres around a point (for extrusions). */
export function circlePolygon(
  longitude: number,
  latitude: number,
  radiusM: number,
  steps = 32,
): number[][] {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((latitude * Math.PI) / 180));
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([longitude + dLon * Math.cos(angle), latitude + dLat * Math.sin(angle)]);
  }
  return ring;
}
