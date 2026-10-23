import { type Map as MapLibre, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { cssVar } from '../../lib/css';
import { useTheme } from '../../lib/theme';
import { createBaseMap } from './base-map';

const BRAZIL = { center: [-51.9, -14.2] as [number, number], zoom: 3.2 };

/** Click (or drag the pin) to place the station. */
export default function LocationPicker({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
}) {
  const { theme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const marker = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initial = useRef({ latitude, longitude });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const start = initial.current;
    const hasPoint = start.latitude !== null && start.longitude !== null;
    const map = createBaseMap(
      container.current,
      theme,
      (loaded) => {
        loaded.on('click', (event) => {
          onChangeRef.current(
            Number(event.lngLat.lat.toFixed(5)),
            Number(event.lngLat.lng.toFixed(5)),
          );
        });
      },
      {
        center: hasPoint ? [start.longitude as number, start.latitude as number] : BRAZIL.center,
        zoom: hasPoint ? 13 : BRAZIL.zoom,
        cooperativeGestures: false,
        onStyleError: () => setFailed(true),
      },
    );
    map.getCanvas().style.cursor = 'crosshair';
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      marker.current?.remove();
      marker.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [theme]);

  // The pin follows the form values (typed coordinates move it too); a new map needs a new pin.
  // biome-ignore lint/correctness/useExhaustiveDependencies: theme recreates the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (latitude === null || longitude === null) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = new Marker({ color: cssVar('--ink'), draggable: true })
        .setLngLat([longitude, latitude])
        .addTo(map);
      marker.current.on('dragend', () => {
        const position = marker.current?.getLngLat();
        if (position)
          onChangeRef.current(Number(position.lat.toFixed(5)), Number(position.lng.toFixed(5)));
      });
    } else {
      marker.current.setLngLat([longitude, latitude]);
    }
  }, [latitude, longitude, theme]);

  return (
    <div className="relative h-72 overflow-hidden rounded-md border border-hairline">
      {/* MapLibre's stylesheet makes its container position: relative, so a wrapper holds the box. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" />
      </div>
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-panel/85 p-4 text-center text-sm text-ink-2">
          Mapa indisponível (sem internet?). Digite a latitude e a longitude nos campos.
        </div>
      )}
    </div>
  );
}
