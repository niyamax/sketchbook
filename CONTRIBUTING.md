# Contributing

Bug reports, focused fixes and small improvements are welcome.

## Get started

Use Node.js 22 LTS, run `npm ci`, and start the reader with `npm run dev`.

Before opening a pull request:

```sh
npm test
npm run build
```

For visual or interaction changes, include a screenshot or short recording and check both desktop and mobile layouts. Useful viewports are 1440 × 1000, 390 × 844 and 768 × 1024.

## Book interactions

Check cover opening and closing, forward and backward turns, repeated clicks, grouped mobile turns, resizing and keyboard navigation. Also try reduced motion and unavailable WebGL. Keep moving and resting fold poses aligned so changing the visible page does not create a jump.

Avoid changing page-turn timing while fixing geometry or shading unless that timing change is intentional and explained.

## Artwork and documentation

The current sketches and cover texture are AI-generated demo assets. Include provenance and licensing information for replacement artwork and keep the on-page disclosure accurate. Do not commit reference photographs without permission.

Update the README previews when a visible change makes them outdated. Keep generated production files in `dist/` out of the source repository.

## Reporting an issue

Include the browser, device or viewport, steps to reproduce, expected behavior and a screenshot or recording if the issue is visual. For folding defects, mention the page and whether the turn was forward, backward or part of a rapid-click packet.
