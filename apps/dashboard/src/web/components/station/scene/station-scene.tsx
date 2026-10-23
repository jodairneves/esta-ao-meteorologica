import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { type RefObject, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  BufferAttribute,
  Color,
  DoubleSide,
  type Group,
  type InstancedMesh,
  Object3D,
  type SphereGeometry,
} from 'three';
import { type Anchor, ScreenAnchors } from './screen-anchors';
import { skyColors } from './sky';

export interface StationSceneProps {
  /** Sun elevation and azimuth (degrees) at the station right now. */
  sun: { elevation: number; azimuth: number };
  latitude: number;
  windMs: number | null;
  windMsPerHz: number;
  rainRateMmH: number | null;
  humidityPct: number | null;
  /** Colour of the enclosure LED (the station status). */
  ledColor: string;
  ledDim: boolean;
  /** Pre-formatted callouts next to each instrument. */
  labels: { shield: string; anemometer: string; gauge: string };
  animate: boolean;
}

const STEEL = '#9aa6ae';
const MOONLIT = new Color('#7f93b5');
const WHITE_PLASTIC = '#e4e9ec';
const GREY_PLASTIC = '#c3cbd1';

/** Cup speed shown on screen: real rotation (from the calibration), compressed so it never strobes. */
function visualRevPerSecond(windMs: number | null, windMsPerHz: number): number {
  if (!windMs || windMs <= 0) return 0;
  const pulsesPerSecond = windMs / windMsPerHz;
  const revolutions = pulsesPerSecond / 2;
  return 2.2 * (1 - Math.exp(-revolutions / 2.2));
}

/** Points where each instrument's callout sits (just above or beside it). */
const CALLOUT_POSITIONS = {
  anemometer: [0, 3.34, 0],
  shield: [-0.5, 1.98, 0],
  gauge: [1.05, 1.42, 0.55],
} as const satisfies Record<keyof StationSceneProps['labels'], [number, number, number]>;

type CalloutRefs = Record<keyof StationSceneProps['labels'], RefObject<HTMLDivElement | null>>;

function Anemometer({ revPerSecond, animate }: { revPerSecond: number; animate: boolean }) {
  const rotor = useRef<Group>(null);
  useFrame((_, delta) => {
    if (animate && rotor.current)
      rotor.current.rotation.y -= revPerSecond * 2 * Math.PI * Math.min(delta, 0.1);
  });
  return (
    <group position={[0, 3.06, 0]}>
      <mesh castShadow position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.03, 0.035, 0.08, 16]} />
        <meshStandardMaterial color={GREY_PLASTIC} roughness={0.5} />
      </mesh>
      <group ref={rotor}>
        <mesh castShadow position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.03, 16]} />
          <meshStandardMaterial color={WHITE_PLASTIC} roughness={0.5} />
        </mesh>
        {[0, 1, 2].map((index) => {
          const angle = (index * 2 * Math.PI) / 3;
          return (
            <group key={index} rotation={[0, angle, 0]}>
              <mesh castShadow position={[0.09, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.005, 0.005, 0.16, 8]} />
                <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
              </mesh>
              {/* Hemispherical cup, opening facing the direction of travel. */}
              <mesh castShadow position={[0.18, 0.02, 0]} rotation={[0, 0, 0]}>
                <sphereGeometry args={[0.045, 20, 12, 0, Math.PI]} />
                <meshStandardMaterial color={WHITE_PLASTIC} roughness={0.45} side={DoubleSide} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

/** Stacked plates of the radiation shield, bottom to top. */
const PLATES = [0, 1, 2, 3, 4, 5, 6];

function RadiationShield() {
  return (
    <group position={[-0.5, 2.18, 0]}>
      {PLATES.map((index) => (
        <mesh key={index} castShadow receiveShadow position={[0, index * 0.03, 0]}>
          <cylinderGeometry args={[0.1 - index * 0.004, 0.11 - index * 0.004, 0.01, 28]} />
          <meshStandardMaterial color={WHITE_PLASTIC} roughness={0.7} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.215, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.02, 28]} />
        <meshStandardMaterial color={WHITE_PLASTIC} roughness={0.7} />
      </mesh>
    </group>
  );
}

function SolarPanel({ latitude }: { latitude: number }) {
  // Panels face the equator, tilted by the latitude (north in Brazil).
  const facesNorth = latitude < 0;
  const tilt = Math.max(10, Math.min(60, Math.abs(latitude))) * (Math.PI / 180);
  return (
    <group position={[0.46, 2.42, 0]} rotation={[0, facesNorth ? Math.PI : 0, 0]}>
      <group rotation={[-tilt, 0, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.44, 0.014, 0.32]} />
          <meshStandardMaterial color="#aab3ba" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.008, 0]}>
          <boxGeometry args={[0.41, 0.004, 0.29]} />
          <meshStandardMaterial color="#1b2b45" metalness={0.4} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

function Enclosure({ ledColor, ledDim }: { ledColor: string; ledDim: boolean }) {
  return (
    <group position={[0, 1.42, 0.075]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.22, 0.28, 0.11]} />
        <meshStandardMaterial color={GREY_PLASTIC} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.07, 0.056]}>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshStandardMaterial
          color={ledColor}
          emissive={ledColor}
          emissiveIntensity={ledDim ? 0.8 : 3}
          toneMapped={false}
        />
      </mesh>
      {/* Cable gland at the bottom. */}
      <mesh position={[0, -0.155, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.03, 12]} />
        <meshStandardMaterial color="#2a3238" roughness={0.8} />
      </mesh>
    </group>
  );
}

function RainGauge() {
  return (
    <group position={[1.05, 0, 0.55]}>
      <mesh castShadow position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 1, 12]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.11, 0]}>
        <cylinderGeometry args={[0.1, 0.09, 0.22, 32]} />
        <meshStandardMaterial color={WHITE_PLASTIC} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.19, 0]}>
        <cylinderGeometry args={[0.096, 0.02, 0.07, 32, 1, true]} />
        <meshStandardMaterial color="#8c969d" roughness={0.6} side={DoubleSide} />
      </mesh>
    </group>
  );
}

function Mast() {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 1.52, 0]}>
        <cylinderGeometry args={[0.034, 0.034, 3.04, 16]} />
        <meshStandardMaterial color={STEEL} metalness={0.65} roughness={0.35} />
      </mesh>
      {/* Cross arm carrying the shield and the panel. */}
      <mesh castShadow position={[0, 2.38, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.016, 0.016, 1.08, 10]} />
        <meshStandardMaterial color={STEEL} metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh receiveShadow position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.28, 0.32, 0.06, 6]} />
        <meshStandardMaterial color="#5d666c" roughness={0.9} />
      </mesh>
    </group>
  );
}

function SkyDome({ top, horizon }: { top: Color; horizon: Color }) {
  const geometry = useRef<SphereGeometry>(null);
  useLayoutEffect(() => {
    const shape = geometry.current;
    if (!shape) return;
    const positions = shape.attributes.position;
    if (!positions) return;
    const colors = new Float32Array(positions.count * 3);
    const color = new Color();
    for (let i = 0; i < positions.count; i++) {
      const height = Math.max(0, positions.getY(i) / 60);
      color.lerpColors(horizon, top, Math.min(1, height ** 0.6));
      color.toArray(colors, i * 3);
    }
    shape.setAttribute('color', new BufferAttribute(colors, 3));
  }, [top, horizon]);
  return (
    <mesh>
      <sphereGeometry ref={geometry} args={[60, 32, 16]} />
      <meshBasicMaterial vertexColors side={BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}

const RAIN_AREA = 5;
const RAIN_TOP = 6;

function Rain({ rateMmH, windMs, animate }: { rateMmH: number; windMs: number; animate: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const count = Math.round(120 + Math.min(1, rateMmH / 25) * 1100);
  const drops = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 2 * RAIN_AREA,
        y: Math.random() * RAIN_TOP,
        z: (Math.random() - 0.5) * 2 * RAIN_AREA,
        speed: 6 + Math.random() * 2,
      })),
    [count],
  );
  const dummy = useMemo(() => new Object3D(), []);
  const slant = Math.min(0.6, windMs / 15);

  useFrame((_, delta) => {
    const instances = mesh.current;
    if (!instances) return;
    const step = animate ? Math.min(delta, 0.1) : 0;
    drops.forEach((drop, index) => {
      drop.y -= drop.speed * step;
      drop.x += drop.speed * slant * step;
      if (drop.y < 0) {
        drop.y += RAIN_TOP;
        drop.x = (Math.random() - 0.5) * 2 * RAIN_AREA;
      }
      if (drop.x > RAIN_AREA) drop.x -= 2 * RAIN_AREA;
      dummy.position.set(drop.x, drop.y, drop.z);
      dummy.rotation.set(0, 0, slant);
      dummy.updateMatrix();
      instances.setMatrixAt(index, dummy.matrix);
    });
    instances.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[0.006, 0.16, 0.006]} />
      <meshBasicMaterial color="#b9cbe0" transparent opacity={0.45} />
    </instancedMesh>
  );
}

function SceneContents({ callouts, ...props }: StationSceneProps & { callouts: CalloutRefs }) {
  const { sun, humidityPct, rainRateMmH } = props;
  const raining = (rainRateMmH ?? 0) > 0;
  const overcast = raining ? 0.75 : (humidityPct ?? 0) >= 97 ? 0.45 : 0;
  const sky = useMemo(() => skyColors(sun.elevation, overcast), [sun.elevation, overcast]);

  const elevation = (sun.elevation * Math.PI) / 180;
  const azimuth = (sun.azimuth * Math.PI) / 180;
  const sunDirection: [number, number, number] = [
    Math.cos(elevation) * Math.sin(azimuth) * 12,
    Math.max(0.3, Math.sin(elevation) * 12),
    -Math.cos(elevation) * Math.cos(azimuth) * 12,
  ];
  const daylight = Math.max(0, Math.min(1, (sun.elevation + 4) / 20));
  const skyFill = useMemo(() => sky.top.clone().lerp(MOONLIT, 1 - daylight), [sky.top, daylight]);
  const anchors = useMemo<Anchor[]>(
    () =>
      (Object.keys(CALLOUT_POSITIONS) as (keyof CalloutRefs)[]).map((key) => ({
        element: callouts[key],
        position: CALLOUT_POSITIONS[key],
      })),
    [callouts],
  );

  return (
    <>
      <SkyDome top={sky.top} horizon={sky.horizon} />
      <fog attach="fog" args={[sky.horizon, 10, 45]} />
      {sun.elevation < -6 && overcast < 0.5 && (
        <Stars radius={50} depth={8} count={1600} factor={2.4} fade speed={0} />
      )}

      {/* At night the fill light turns moonlit blue, so the instruments stay legible. */}
      <hemisphereLight args={[skyFill, '#26301f', 0.6 + daylight * 0.55]} />
      <directionalLight
        castShadow
        position={sunDirection}
        color={sky.sunlight}
        intensity={daylight * (1.9 - overcast * 1.2)}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={4}
        shadow-camera-bottom={-2}
        shadow-bias={-0.0004}
      />
      {/* Moonlight keeps the night scene readable. */}
      <directionalLight position={[-4, 6, 3]} color="#9fb4d9" intensity={(1 - daylight) * 0.9} />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[40, 48]} />
        <meshStandardMaterial color={sky.ground} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[1.7, 40]} />
        <meshStandardMaterial color="#6b6a5f" roughness={1} />
      </mesh>

      <Mast />
      <Anemometer
        revPerSecond={visualRevPerSecond(props.windMs, props.windMsPerHz)}
        animate={props.animate}
      />
      <RadiationShield />
      <SolarPanel latitude={props.latitude} />
      <Enclosure ledColor={props.ledColor} ledDim={props.ledDim} />
      <RainGauge />
      {raining && (
        <Rain rateMmH={rainRateMmH ?? 0} windMs={props.windMs ?? 0} animate={props.animate} />
      )}

      <ScreenAnchors anchors={anchors} />
    </>
  );
}

/**
 * The station as it stands in the field, built from simple geometry: cups spinning with the
 * measured wind, rain falling when the gauge counts, the sky of the station's own place and
 * hour, and the enclosure LED in the status colour. Drag to orbit.
 */
export default function StationScene(props: StationSceneProps) {
  const anemometer = useRef<HTMLDivElement>(null);
  const shield = useRef<HTMLDivElement>(null);
  const gauge = useRef<HTMLDivElement>(null);
  const callouts = useMemo(() => ({ anemometer, shield, gauge }), []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        frameloop={props.animate ? 'always' : 'demand'}
        camera={{ position: [3.4, 2.5, 4.4], fov: 38, near: 0.1, far: 200 }}
        gl={{ antialias: true }}
        aria-label="Cena 3D da estação"
      >
        <SceneContents {...props} callouts={callouts} />
        <OrbitControls
          target={[0, 1.6, 0]}
          enablePan={false}
          enableDamping
          minDistance={2.6}
          maxDistance={9}
          minPolarAngle={0.35}
          maxPolarAngle={Math.PI / 2 - 0.06}
        />
      </Canvas>
      {(Object.keys(callouts) as (keyof CalloutRefs)[]).map((key) => (
        <div
          key={key}
          ref={callouts[key]}
          aria-hidden
          style={{ visibility: 'hidden' }}
          className="pointer-events-none absolute top-0 left-0 rounded-md border border-hairline bg-panel/85 px-2 py-1 text-xs whitespace-nowrap text-ink backdrop-blur-sm"
        >
          {props.labels[key]}
        </div>
      ))}
    </div>
  );
}
