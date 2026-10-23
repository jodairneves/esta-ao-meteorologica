import { Color } from 'three';

interface SkyStop {
  elevation: number;
  top: string;
  horizon: string;
  sunlight: string;
  ground: string;
}

/**
 * Sky by sun elevation: night, blue hour, dusk glow, golden hour and day. Muted on purpose,
 * so the scene sits inside the slate interface without glaring.
 */
const STOPS: SkyStop[] = [
  { elevation: -18, top: '#060c14', horizon: '#0c1622', sunlight: '#33415c', ground: '#0d130e' },
  { elevation: -8, top: '#0e1729', horizon: '#1d2740', sunlight: '#4a5680', ground: '#121a13' },
  { elevation: -3, top: '#1f2a4d', horizon: '#6b4f66', sunlight: '#c27a63', ground: '#1a2318' },
  { elevation: 2, top: '#34507e', horizon: '#c98a5e', sunlight: '#ffb27a', ground: '#27331f' },
  { elevation: 10, top: '#3f6a9c', horizon: '#9fb7cc', sunlight: '#ffe1bd', ground: '#33422a' },
  { elevation: 35, top: '#3a6ca6', horizon: '#b3c8db', sunlight: '#fff6e8', ground: '#3a4a2f' },
];

const OVERCAST = new Color('#5f6a73');

export interface SkyColors {
  top: Color;
  horizon: Color;
  sunlight: Color;
  ground: Color;
}

function mix(a: string, b: string, t: number): Color {
  return new Color(a).lerp(new Color(b), t);
}

/** `overcast` (0–1) greys the sky for rain and fog. */
export function skyColors(elevation: number, overcast = 0): SkyColors {
  const first = STOPS[0] as SkyStop;
  const last = STOPS.at(-1) as SkyStop;
  let lower = first;
  let upper = last;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i] as SkyStop;
    const b = STOPS[i + 1] as SkyStop;
    if (elevation >= a.elevation && elevation <= b.elevation) {
      lower = a;
      upper = b;
      break;
    }
  }
  if (elevation <= first.elevation) upper = first;
  if (elevation >= last.elevation) lower = last;
  const span = upper.elevation - lower.elevation;
  const t = span === 0 ? 0 : (elevation - lower.elevation) / span;

  const colors: SkyColors = {
    top: mix(lower.top, upper.top, t),
    horizon: mix(lower.horizon, upper.horizon, t),
    sunlight: mix(lower.sunlight, upper.sunlight, t),
    ground: mix(lower.ground, upper.ground, t),
  };
  if (overcast > 0) {
    // Clouds flatten the sky toward a grey that keeps the scene's brightness.
    const day = Math.max(0, Math.min(1, (elevation + 6) / 16));
    const grey = OVERCAST.clone().multiplyScalar(0.35 + day * 0.65);
    colors.top.lerp(grey, overcast);
    colors.horizon.lerp(grey, overcast * 0.85);
    colors.sunlight.lerp(new Color('#d9dde0'), overcast);
  }
  return colors;
}
