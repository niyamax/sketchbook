// One broad key light above and to the viewer's left, in page-width units.
// Three.js uses y-up; the DOM projection below uses screen y-down.
export const BOOK_LIGHT = Object.freeze({x: -.45, y: .65, z: 1});
export function projectShadow(point: {x: number; y: number; z: number}) {
  return {x: point.x - point.z * BOOK_LIGHT.x / BOOK_LIGHT.z, y: point.y + point.z * BOOK_LIGHT.y / BOOK_LIGHT.z};
}
// The native gradients supply their own strength. This only gates their
// lifecycle, with zero value and slope at both resting endpoints.
export function nativeShadowEnvelope(progress: number) {
  const t=Math.max(0,Math.min(1,progress));
  return t===0||t===1?0:Math.sin(Math.PI*t)**2;
}
