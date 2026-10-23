import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { createRef, type RefObject, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Color, type InstancedMesh, Object3D } from 'three';
import { formatDay, formatNumber } from '../../../lib/format';
import { type Anchor, ScreenAnchors } from './screen-anchors';

export interface Heatmap3DProps {
  days: string[];
  cells: [number, number, number][];
  /** Ramp colours, low → high (already resolved from the theme). */
  ramp: string[];
  unit: string;
  digits: number;
  background: string;
  ink: string;
  animate: boolean;
}

const CELL = 0.32;
const GAP = 0.06;
const PITCH = CELL + GAP;
const MAX_HEIGHT = 2.4;
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

function rampColor(ramp: Color[], fraction: number): Color {
  if (ramp.length === 0) return new Color('#888888');
  const position = Math.max(0, Math.min(1, fraction)) * (ramp.length - 1);
  const index = Math.floor(position);
  const lower = ramp[index] as Color;
  const upper = ramp[Math.min(index + 1, ramp.length - 1)] as Color;
  return lower.clone().lerp(upper, position - index);
}

/** Grid geometry shared by the bars and the DOM labels. */
function layout(days: number, cells: [number, number, number][]) {
  const values = cells.map((cell) => cell[2]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const width = 24 * PITCH;
  const depth = days * PITCH;
  return {
    min,
    span: max - min || 1,
    x: (hour: number) => hour * PITCH - width / 2,
    z: (day: number) => day * PITCH - depth / 2,
    depth,
  };
}

function Bars({
  cells,
  ramp,
  grid,
  onHover,
}: {
  cells: [number, number, number][];
  ramp: string[];
  grid: ReturnType<typeof layout>;
  onHover: (index: number | null) => void;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const colors = useMemo(() => ramp.map((value) => new Color(value)), [ramp]);

  useLayoutEffect(() => {
    const instances = mesh.current;
    if (!instances) return;
    const dummy = new Object3D();
    cells.forEach(([day, hour, value], index) => {
      const fraction = (value - grid.min) / grid.span;
      const height = 0.04 + fraction * MAX_HEIGHT;
      dummy.position.set(grid.x(hour), height / 2, grid.z(day));
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      instances.setMatrixAt(index, dummy.matrix);
      instances.setColorAt(index, rampColor(colors, fraction));
    });
    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
    instances.computeBoundingSphere();
  }, [cells, colors, grid]);

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, cells.length]}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        onHover(event.instanceId ?? null);
      }}
      onPointerOut={() => onHover(null)}
    >
      <boxGeometry args={[CELL, 1, CELL]} />
      <meshStandardMaterial roughness={0.7} />
    </instancedMesh>
  );
}

/** Hour × day grid as a landscape of columns: the same data and ramp as the flat heatmap. */
export default function Heatmap3D({
  background,
  ink,
  animate,
  days,
  cells,
  ramp,
  unit,
  digits,
}: Heatmap3DProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const grid = useMemo(() => layout(days.length, cells), [days.length, cells]);
  const tooltip = useRef<HTMLDivElement>(null);
  const hourRefs = useMemo(() => HOUR_TICKS.map(() => createRef<HTMLSpanElement>()), []);
  const dayTicks = useMemo(() => {
    const step = Math.max(1, Math.ceil(days.length / 6));
    return days.flatMap((day, index) => (index % step === 0 ? [{ day, index }] : []));
  }, [days]);
  const dayRefs = useMemo(() => dayTicks.map(() => createRef<HTMLSpanElement>()), [dayTicks]);
  const hoveredCell = hovered === null ? undefined : cells[hovered];

  const anchors = useMemo<Anchor[]>(() => {
    const list: Anchor[] = [
      ...HOUR_TICKS.map((hour, index) => ({
        element: hourRefs[index] as RefObject<HTMLElement | null>,
        position: [grid.x(hour), 0, grid.depth / 2 + 0.45] as [number, number, number],
      })),
      ...dayTicks.map((tick, index) => ({
        element: dayRefs[index] as RefObject<HTMLElement | null>,
        position: [grid.x(0) - 1.1, 0, grid.z(tick.index)] as [number, number, number],
      })),
    ];
    if (hoveredCell) {
      const [day, hour, value] = hoveredCell;
      list.push({
        element: tooltip,
        position: [grid.x(hour), 0.45 + ((value - grid.min) / grid.span) * MAX_HEIGHT, grid.z(day)],
      });
    }
    return list;
  }, [grid, hourRefs, dayTicks, dayRefs, hoveredCell]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas
        dpr={[1, 2]}
        frameloop={animate ? 'always' : 'demand'}
        camera={{ position: [0, 6.5, grid.depth / 2 + 7], fov: 40 }}
        aria-label="Mapa de calor em 3D"
      >
        <color attach="background" args={[background]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[6, 10, 6]} intensity={1.4} />
        <directionalLight position={[-6, 4, -4]} intensity={0.3} color={ink} />
        <Bars cells={cells} ramp={ramp} grid={grid} onHover={setHovered} />
        <ScreenAnchors anchors={anchors} />
        <OrbitControls
          enablePan={false}
          enableDamping
          minDistance={4}
          maxDistance={30}
          maxPolarAngle={Math.PI / 2 - 0.08}
        />
      </Canvas>

      {HOUR_TICKS.map((hour, index) => (
        <span
          key={hour}
          ref={hourRefs[index]}
          aria-hidden
          style={{ visibility: 'hidden' }}
          className="pointer-events-none absolute top-0 left-0 text-xs text-ink-3"
        >
          {String(hour).padStart(2, '0')}h
        </span>
      ))}
      {dayTicks.map((tick, index) => (
        <span
          key={tick.day}
          ref={dayRefs[index]}
          aria-hidden
          style={{ visibility: 'hidden' }}
          className="pointer-events-none absolute top-0 left-0 text-xs whitespace-nowrap text-ink-3"
        >
          {formatDay(tick.day)}
        </span>
      ))}
      <div
        ref={tooltip}
        aria-hidden
        style={{ visibility: 'hidden' }}
        className={
          hoveredCell
            ? 'pointer-events-none absolute top-0 left-0 rounded-md border border-hairline bg-raised px-2.5 py-1.5 text-[13px] whitespace-nowrap text-ink'
            : 'hidden'
        }
      >
        {hoveredCell && (
          <>
            <div className="text-ink-2">
              {formatDay(days[hoveredCell[0]] ?? '')}, {String(hoveredCell[1]).padStart(2, '0')}h
            </div>
            <strong className="font-semibold">
              {formatNumber(hoveredCell[2], digits)} {unit}
            </strong>
          </>
        )}
      </div>
    </div>
  );
}
