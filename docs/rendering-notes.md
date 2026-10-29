# Rendering notes

## Two readers, shared artwork

Desktop uses react-pageflip and the locked PageFlip 2.0.7 DOM renderer. Mobile and tablet, up to 768 px, use Three.js with a perspective camera and a deformed sheet. Both render the same page catalog and cover texture.

The DOM supplies accessible page content and the mobile texture source. The mobile renderer can capture images and typeset text; source wrappers are hidden after the first WebGL frame is ready.

## Mobile folds

The paper mesh has 64 × 32 segments, concentrated around the binding and rounded corners. Output pixel density is capped at 2×. Hidden pile leaves are skipped, and paper already behind the book keeps a stable identity and resting pose.

Normal turns use a small deterministic duration variation per physical leaf. A backward turn reuses the same leaf's duration. The cover takes 1.85 seconds; a rapid packet takes 0.72 seconds. Timing constants and packet bounds are in `src/components/mobile-book-motion.ts`.

The hinge gradually joins its resting depth during the turn. Folded and packet leaves reach their destination geometry and normals before their roles change. This avoids a visible jump when the next readable page becomes the front page.

### Paper illumination

One upper-left directional light shades the paper and charcoal cover. Paper has a scattered-light approximation in its existing material:

```glsl
outgoingLight = mix(outgoingLight, max(outgoingLight, diffuseColor.rgb), paperFill);
```

`paperFill` is 0.45 for paper and zero for covers. It softens underlit curls without changing bright paper or adding a second light. The directional response still follows the actual curve, including reverse turns. The binding tint grows from 0.035 to 0.08, matching the folded stack's endpoint.

There are no mobile shadow maps, casting meshes or GPU ground receiver. A faint CSS ground shadow uses the camera-projected footprint calculated once on layout. It stays fixed through page turns.

## Desktop folds and centering

PageFlip positions the folded DOM page and its outer shadow gradient. The gradient has a 0.16 opacity cap, a 3 px CSS blur and a `sin²(π × progress)` gate that reaches zero at both endpoints. Native inner and hard-cover gradients are hidden.

During cover turns, a narrow gradient is confined to the stationary paper near the spine. Two fixed CSS ground footprints keep contact beneath the flat pages. The raised cover loses contact as it lifts and regains it as it settles, avoiding a detached rectangle on the empty floor.

The adapter reads the public `getFlipController().getCalculation()` progress and direction. That clock drives continuous book centering through cover opening and closing. Side controls hide immediately during cover motion and available directions fade back in over 200 ms once it settles. Reduced motion skips the fade.

PageFlip emits a state event before updating its state getter. The adapter uses the event payload to commit the resting pose and clear turn shading synchronously.

## First presentation, fallback and cleanup

The final book slot is reserved while the cover and first renderer frame are prepared. A short opacity reveal avoids flashing an unpositioned DOM cover. Reduced motion skips the reveal transition.

Mobile uses the DOM reader when reduced motion is requested or WebGL is unavailable. Resizing or context loss cancels pending turns and clears queued input. Renderers, textures, geometry, listeners and animation frames are disposed on teardown.

## Verification

Unit tests cover cover centering, ground contact, shadow endpoints and state-event ordering, plus mobile duration and packet rules.

Browser checks cover desktop spreads, phone and tablet layouts, first presentation, forward and reverse turns, rapid packets, cover closing and DOM fallback. Controlled fold frames compare moving and resting states: the latest cover, ordinary, six-sheet packet and late-page checks differed in less than 0.001% of canvas pixels at handoff.

These are local browser checks. They do not establish a frame-rate guarantee on physical phones. The material fill adds no lights or rendering passes, and the CSS ground shadow avoids a GPU shadow pass.
