let cached: boolean | undefined;

/**
 * Whether this browser can create a WebGL2 context. The map and the 3D views need it; without
 * graphics acceleration (turned off, blocked GPU, some remote desktops) they show a notice.
 */
export function supportsWebGL2(): boolean {
  if (cached !== undefined) return cached;
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    cached = context !== null;
    // Hand the probe context back right away: browsers cap how many can be alive.
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
