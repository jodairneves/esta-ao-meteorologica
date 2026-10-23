import { useFrame, useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useMemo } from 'react';
import { Vector3 } from 'three';

export interface Anchor {
  /** A plain element absolutely positioned at the top-left of the canvas wrapper. */
  element: RefObject<HTMLElement | null>;
  position: [number, number, number];
}

/**
 * Keeps ordinary DOM labels glued to points of the 3D scene by projecting them every frame.
 * (drei's <Html> mounts a React root per label, which React 19's strict mode tears down
 * mid-render and loses labels.) Labels behind the camera are hidden.
 */
export function ScreenAnchors({ anchors }: { anchors: Anchor[] }) {
  const point = useMemo(() => new Vector3(), []);
  // On-demand canvases (reduced motion) need a frame to place labels that just appeared.
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (anchors.length) invalidate();
  }, [anchors, invalidate]);
  useFrame(({ camera, size }) => {
    for (const anchor of anchors) {
      const element = anchor.element.current;
      if (!element) continue;
      point.set(...anchor.position).project(camera);
      const x = ((point.x + 1) / 2) * size.width;
      const y = ((1 - point.y) / 2) * size.height;
      element.style.visibility = point.z < 1 ? 'visible' : 'hidden';
      element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  });
  return null;
}
