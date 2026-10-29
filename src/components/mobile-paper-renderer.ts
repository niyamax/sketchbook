import { BOOK_LIGHT } from "../sketch/lighting";
import { PAGE_ASPECT } from "../sketch/geometry";
import {paperStock,paperTexture,createPaperMaterial,createBookRenderer,addBookLight} from "./book-rendering";
import * as THREE from "three";

// A page travels through 360°: it rolls around a tapered spine and comes to
// rest behind the readable leaf. Units are page widths, independent of viewport.
const ASPECT = PAGE_ASPECT;
const TAU = Math.PI * 2;
// The cover folds nearest the back board. Each later leaf wraps farther behind
// it, ending a little higher and to the left. Keep these poses identical for
// the moving sheet and its resting replacement.
const COVER_FOLD_RADIUS = 0.045;
// Leave room for the cover's physical edge, including the narrow lower curl.
const paperFoldRadius = (page: number) => 0.05 + Math.min(page, 40) * 0.00065;
const COVER_THICKNESS = 0.002;
const PAGE_COLUMNS = 64;
const PAGE_ROWS = 32;
const PAGE_STRIDE = PAGE_COLUMNS + 1;
// Give the tight spine as many segments as the broad free panel.
const columnU = (u: number) =>
  u <= 1 / 3
    ? u * 0.3
    : u <= 2 / 3
      ? 0.1 + (u - 1 / 3) * 0.9
      : 0.4 + (u - 2 / 3) * 1.8;
const COVER_REST_DEPTH = 0.05;
const FOLDED_HINGE_X = 0;
const foldedRise = (page: number) => Math.min(page, 40) * 0.0006;
const PAPER_CORNER = 0.035;
const COVER_CORNER = 0.045;
const smooth = (value: number) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

// Quintic interpolation keeps curvature acceleration continuous at both ends.
const smoother = (value: number) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (6 * t - 15) + 10);
};

function conePoint(
  x: number,
  y: number,
  taper: number,
  radius: number,
  limit: number,
) {
  const r = Math.max(0.0001, radius + (ASPECT / 2 - y) * taper);
  const slant = (x * taper) / r;
  const wrap = Math.abs(slant) < 0.001 ? x / r : Math.atan(slant) / taper;
  const coneCos = Math.sqrt(1 - taper * taper);
  const outlet = Math.min(limit, 0.42);
  let curved: THREE.Vector3 | undefined;
  if (wrap < limit) {
    const reach = Math.hypot(r, x * taper);
    curved = new THREE.Vector3(
      reach * Math.sin(wrap),
      y + taper * (reach * (1 - Math.cos(wrap)) - (x * x) / (r + reach)),
      reach * coneCos * (1 - Math.cos(wrap)),
    );
    if (wrap <= limit - outlet) return curved;
  }
  const fan = taper * limit;
  const sinc =
    Math.abs(fan) < 0.001 ? 1 - (fan * fan) / 6 : Math.sin(fan) / fan;
  const versine = Math.abs(fan) < 0.001 ? fan / 2 : (1 - Math.cos(fan)) / fan;
  const along = x * taper * Math.sin(fan) + r * Math.cos(fan);
  const past = x * Math.cos(fan) - r * limit * sinc;
  const lift = along * (1 - Math.cos(limit)) + past * Math.sin(limit);
  const tangent = new THREE.Vector3(
    along * Math.sin(limit) + past * Math.cos(limit),
    y + r * limit * versine - x * Math.sin(fan) + taper * lift,
    coneCos * lift,
  );
  // Ease curvature out over the last part of the roll instead of meeting a
  // perfectly flat panel at a sharp change in curvature.
  return curved
    ? curved.lerp(tangent, smoother((wrap - limit + outlet) / outlet))
    : tangent;
}

function shapeSheet(
  geometry: THREE.PlaneGeometry,
  progress: number,
  radius: number,
  lift: number,
  grabY = 0,
  corner = PAPER_CORNER,
  stackRise = 0,
  pageWidth = 1,
  pageHeight = ASPECT,
) {
  const lead = TAU * (1 - (1 - progress) ** 2);
  const phase = lead / TAU;
  const spine = (105 * Math.PI) / 180;
  // Transfer from hinge rotation into the roll with continuous angular
  // acceleration. Integrating smoothstep avoids a kink at either boundary.
  const handoff = (35 * Math.PI) / 180;
  const excess = lead - spine;
  const transfer = THREE.MathUtils.clamp(
    (excess + handoff) / (2 * handoff),
    0,
    1,
  );
  const wrap =
    excess >= handoff
      ? excess
      : handoff * (2 * transfer ** 3 - transfer ** 4);
  const rotation = lead - wrap;
  const rollPhase = smooth(wrap / (TAU - spine));
  const rollScale =
    1 +
    1.1 * (1 - rollPhase) +
    (corner === COVER_CORNER ? 0.1 : 0.35) * Math.sin(Math.PI * rollPhase) ** 2;
  const top = radius * rollScale;
  // The travelling curl is broader across the sheet; only the settled spine
  // keeps the strong taper that creates the folded fan.
  const taperRatio = 0.28 + 0.28 * Math.sin(Math.PI * phase) ** 2;
  const taper = (radius * taperRatio * rollScale - top) / ASPECT;
  const endX = (y: number) => {
    const rowRadius = Math.max(0.0001, top + (ASPECT / 2 - y) * taper);
    return Math.abs(taper) < 0.0001
      ? rowRadius * wrap
      : (rowRadius * Math.tan(taper * wrap)) / taper;
  };
  const settledTilt = Math.atan2(
    endX(-pageHeight / 2) - endX(pageHeight / 2),
    pageHeight,
  );
  const tilt = THREE.MathUtils.lerp(
    grabY * 0.38,
    settledTilt,
    smoother(phase),
  );
  const cos = Math.cos(tilt),
    sin = Math.sin(tilt);
  const start = Math.max(
    endX(pageHeight / 2) * cos + (pageHeight / 2) * sin,
    endX(-pageHeight / 2) * cos - (pageHeight / 2) * sin,
  );
  const length = Math.max(
    0.001,
    pageWidth * cos + (pageHeight / 2) * Math.abs(sin) - start,
  );
  // The free panel keeps a little elastic bow as the roll travels behind the
  // spine. Let it relax over the whole landing instead of becoming a rigid
  // tangent plane halfway through the wrap. Both resting poses remain exact.
  const trailingBend =
    (corner === COVER_CORNER ? 0.16 : 0.48) *
    Math.sin(Math.PI * smooth((phase - 0.42) / 0.58)) ** 2;
  // Distribute the free panel's bend instead of clamping it to the hinge
  // angle. A smooth limit prevents a visible kink as the leaf joins the roll.
  // Stronger bending makes the lower corner cross back over the readable
  // face before wrapping behind the spine. Keep this bow below that reversal.
  const panelBend =
    2.5 * (1 - smoother((progress - 0.3) / 0.5)) * (lead - TAU * progress) +
    trailingBend;
  const bend = -lead * Math.tanh(panelBend / Math.max(lead, 0.0001));
  const pileLift = lift * (1 - smoother(lead / spine));
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const uv = geometry.attributes.uv;
  const ca = Math.cos(rotation),
    sa = Math.sin(rotation);
  for (let index = 0; index < position.count; index++) {
    const u = uv.getX(index),
      y = (uv.getY(index) - 0.5) * pageHeight;
    // Round the actual silhouette, including the thickness of the cover.
    const cornerY = Math.max(0, Math.abs(y) - (pageHeight / 2 - corner));
    const inset =
      corner - Math.sqrt(Math.max(0, corner * corner - cornerY * cornerY));
    // Paper meets at a square binding edge; only its free corners are rounded.
    const bindingInset = 0;
    const x =
      (bindingInset + u * (pageWidth - inset - bindingInset)) *
      (1 - pileLift * 0.04);
    const along = x * cos + y * sin;
    const across = -x * sin + y * cos;
    const beyond = Math.max(0, along - start);
    const angle = (beyond / length) * bend;
    const curled =
      along -
      beyond +
      beyond * (Math.abs(angle) < 0.0001 ? 1 : Math.sin(angle) / angle);
    const height =
      Math.abs(angle) < 0.0001 ? 0 : (beyond * (1 - Math.cos(angle))) / angle;
    const cx = curled * cos - across * sin,
      cy = curled * sin + across * cos;
    const point = conePoint(cx, cy, taper, top, wrap);
    if (height !== 0) {
      const tangentX = conePoint(cx + 0.001, cy, taper, top, wrap).sub(point);
      const tangentY = conePoint(cx, cy + 0.001, taper, top, wrap).sub(point);
      point.add(tangentX.cross(tangentY).normalize().multiplyScalar(height));
    }
    const rise = Math.sqrt(Math.max(0, 1 - (1 - Math.min(x / 0.4, 1)) ** 2));
    const pile =
      pileLift *
      rise *
      (1 - 0.5 * smooth((x - 0.4) / 0.6)) *
      (1 - (0.6 * y) / ASPECT);
    const z = point.z + pile;
    position.setXYZ(
      index,
      point.x * ca - z * sa,
      point.y + stackRise * smooth(beyond / length),
      point.x * sa + z * ca,
    );
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

export function createPaperRenderer(
  host: HTMLElement,
  width: number,
  height: number,
) {
  const palette = getComputedStyle(host);
  const paperColor = palette.getPropertyValue("--sketchbook-paper").trim();
  const coverEdgeColor = palette
    .getPropertyValue("--sketchbook-cover-edge")
    .trim();
  // The paper leaves its resting bounds during a turn. CSS and the camera
  // share these scales so extra drawing room does not shrink the book.
  const canvasScaleX =
    parseFloat(palette.getPropertyValue("--book-canvas-scale-x")) || 2.8;
  const canvasScaleY =
    parseFloat(palette.getPropertyValue("--book-canvas-scale-y")) || 1.6;
  const renderer=createBookRenderer(host,width*canvasScaleX,height*canvasScaleY);
  const viewHeight = (ASPECT * canvasScaleY) / 0.91;
  // A longer lens keeps a lifted leaf from ballooning over the reader controls.
  const cameraDistance = 6.2;
  const camera = new THREE.PerspectiveCamera(
    (2 * Math.atan(viewHeight / (cameraDistance * 2)) * 180) / Math.PI,
    (width * canvasScaleX) / (height * canvasScaleY),
    1,
    10,
  );
  // Keep the readable page centered; the folded spine extends to its left.
  camera.position.set(0.5, 0.015, cameraDistance);
  const scene = new THREE.Scene();
  const stock = paperStock();
  // One upper-left key: diffuse shading and every shadow share this direction.
  // No hemisphere fill or second environment highlight competes with it.
  addBookLight(scene,0.4);

  // Project the fixed book footprint once for a browser-cached CSS shadow.
  // Return fractions so CSS and the canvas stay aligned at fractional sizes.
  camera.updateMatrixWorld();
  const projectGround = (x: number,y: number) => {
    const point = new THREE.Vector3(x,y,-0.07).project(camera);
    return {x:(point.x+1)*canvasScaleX/2-(canvasScaleX-1)/2,y:(1-point.y)*canvasScaleY/2-(canvasScaleY-1)/2};
  };
  const groundWidth = 1.035, groundHeight = ASPECT*1.045;
  const groundTop = projectGround(0,groundHeight/2), groundBottom = projectGround(groundWidth,-groundHeight/2);
  const groundScale = (groundBottom.x-groundTop.x)*width/groundWidth;
  const groundFootprint = {left:groundTop.x,top:groundTop.y,width:groundBottom.x-groundTop.x,height:groundBottom.y-groundTop.y,radius:COVER_CORNER*groundScale,offsetX:-BOOK_LIGHT.x*.025*groundScale,offsetY:BOOK_LIGHT.y*.025*groundScale,blur:.018*groundScale};
  const blankCanvas = document.createElement("canvas");
  blankCanvas.width = blankCanvas.height = 2;
  const blankContext = blankCanvas.getContext("2d")!;
  blankContext.fillStyle = paperColor;
  blankContext.fillRect(0, 0, 2, 2);
  const blank = new THREE.CanvasTexture(blankCanvas);
  blank.colorSpace = THREE.SRGBColorSpace;

  function leaf() {
    const geometry = new THREE.PlaneGeometry(
      1,
      ASPECT,
      PAGE_COLUMNS,
      PAGE_ROWS,
    );
    // Concentrate columns at the spine and rows at the rounded ends.
    const uv = geometry.attributes.uv;
    const edgeRows = 5 / PAGE_ROWS;
    for (let i = 0; i < uv.count; i++) {
      const v = uv.getY(i);
      const denseV =
        v < edgeRows
          ? (v / edgeRows) * 0.055
          : v > 1 - edgeRows
            ? 1 - ((1 - v) / edgeRows) * 0.055
            : 0.055 + ((v - edgeRows) / (1 - edgeRows * 2)) * 0.89;
      uv.setXY(i, columnU(uv.getX(i)), denseV);
    }
    const {material,back,faceInk,bindingShade,paperFill}=createPaperMaterial(blank,stock);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    scene.add(mesh);
    return {
      geometry,
      material,
      mesh,
      back,
      faceInk,
      bindingShade,
      paperFill,
    };
  }
  function coverEdge(cover: ReturnType<typeof leaf>) {
    const boundary: number[] = [];
    for (let x = 0; x < PAGE_COLUMNS; x++) boundary.push(x);
    for (let y = 0; y < PAGE_ROWS; y++)
      boundary.push(y * PAGE_STRIDE + PAGE_COLUMNS);
    for (let x = PAGE_COLUMNS; x > 0; x--)
      boundary.push(PAGE_ROWS * PAGE_STRIDE + x);
    for (let y = PAGE_ROWS; y > 0; y--) boundary.push(y * PAGE_STRIDE);
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(boundary.length * 18);
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    const material = new THREE.MeshStandardMaterial({
      color: coverEdgeColor,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    cover.mesh.add(mesh);
    return {
      mesh,
      update() {
        const points = cover.geometry.attributes.position;
        const normals = cover.geometry.attributes.normal;
        for (let i = 0; i < boundary.length; i++) {
          const a = boundary[i],
            b = boundary[(i + 1) % boundary.length];
          const corners = [
            [a, 0],
            [a, COVER_THICKNESS],
            [b, COVER_THICKNESS],
            [a, 0],
            [b, COVER_THICKNESS],
            [b, 0],
          ];
          corners.forEach(([index, depth], corner) => {
            const offset = i * 18 + corner * 3;
            vertices[offset] = points.getX(index) - normals.getX(index) * depth;
            vertices[offset + 1] =
              points.getY(index) - normals.getY(index) * depth;
            vertices[offset + 2] =
              points.getZ(index) - normals.getZ(index) * depth;
          });
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
      },
      dispose() {
        geometry.dispose();
        material.dispose();
      },
    };
  }
  // A folded sheet keeps its identity and base pose for the life of the book.
  // Resampling a handful of proxy sheets made the entire fan slide each turn.
  const behind = new Map<number, ReturnType<typeof leaf>>();
  type FoldPose = { positions: Float32Array; normals: Float32Array };
  const behindPoses = new Map<
    number,
    { count: number; span: number; from: FoldPose; to: FoldPose; blend: number }
  >();
  const pile = Array.from({ length: 5 }, leaf);
  const sheet = leaf();
  // The covers stay in the scene even after their page leaves the texture window.
  const foldedCover = leaf();
  const backCover = leaf();
  const movingEdge = coverEdge(sheet);
  const foldedEdge = coverEdge(foldedCover);
  const backEdge = coverEdge(backCover);
  const leaves = [...pile, sheet, foldedCover, backCover];
  let textures: THREE.Texture[] = [];
  let coverTexture: THREE.Texture | null = null;
  let coverTextureKey = "";
  let liningTexture: THREE.Texture | null = null;
  let radius = paperFoldRadius(0);
  let sheetPage = 0;
  let turnSpan = 1;
  const packetPoses = new Map<number, { from: FoldPose; to: FoldPose }>();
  let foldPositions = new Float64Array(0);
  const foldPosition = (page: number) => foldPositions[page] ?? 0;
  const loadedFoldPosition = (page: number, count: number) => {
    // The fan closes very slightly under the growing stack. Recent folds
    // take most of the pressure; deeper folds share a much smaller movement.
    const pressure =
      0.1 * smooth((count - page) / 8) + (0.05 * count) / (count + 16);
    return foldPosition(page) * (1 - pressure);
  };
  let openingCover = false;
  let isDisposed = false;
  let grab = 0;

  function prepareFoldPositions(pageCount: number) {
    if (foldPositions.length === pageCount) return;
    foldPositions = new Float64Array(pageCount);
    behindPoses.clear();
    if (pageCount > 1) foldPositions[1] = 1;
    if (pageCount <= 2) return;
    // Most sheets lie close together; occasional wider air gaps break the stack
    // into loose groups. Seed by page number, never by time or turn progress.
    let total = 0;
    const lastFolded = pageCount - 2;
    for (let page = 2; page <= lastFolded; page++) {
      const seed = Math.sin(page * 127.1 + 19.7) * 43758.5453;
      const air = seed - Math.floor(seed);
      total += 0.1 + air * 0.2 + 5.2 * air ** 12;
      foldPositions[page] = total;
    }
    const span = Math.min(39, Math.max(0, lastFolded - 1));
    for (let page = 2; page <= lastFolded; page++) {
      foldPositions[page] = 1 + (foldPositions[page] / total) * span;
    }
    // The last readable page stays on the front of the book.
    foldPositions[pageCount - 1] = foldPositions[lastFolded];
  }

  function captureFoldPose(
    paper: ReturnType<typeof leaf>,
    page: number,
    count: number,
  ): FoldPose {
    const position = loadedFoldPosition(page, count);
    shapeSheet(
      paper.geometry,
      1,
      paperFoldRadius(position),
      0,
      0,
      PAPER_CORNER,
      foldedRise(position),
    );
    return {
      positions: new Float32Array(paper.geometry.attributes.position.array),
      normals: new Float32Array(paper.geometry.attributes.normal.array),
    };
  }

  function packetStart(paper: ReturnType<typeof leaf>, depth: number): FoldPose {
    shapeSheet(paper.geometry, 0, radius, 0.075 / (1 + depth * 0.5));
    const positions = new Float32Array(paper.geometry.attributes.position.array);
    for (let i = 2; i < positions.length; i += 3) positions[i] -= depth * 0.0012;
    return {
      positions,
      normals: new Float32Array(paper.geometry.attributes.normal.array),
    };
  }

  function poseDifference(pose: FoldPose, base: FoldPose): FoldPose {
    return {
      positions: pose.positions.map((value, i) => value - base.positions[i]),
      normals: pose.normals.map((value, i) => value - base.normals[i]),
    };
  }

  function prepareFoldedPages(page: number) {
    packetPoses.clear();
    behind.forEach((paper, number) => {
      paper.mesh.visible = number < page ||
        (number > page && number < page + turnSpan);
    });
    const count = Math.max(0, page - 1);
    const baseStart = turnSpan > 1 ? packetStart(sheet, 0) : null;
    const baseEnd = turnSpan > 1
      ? captureFoldPose(sheet, page, count + turnSpan)
      : null;
    for (let number = 1; number < page + turnSpan; number++) {
      if (number === page) continue;
      let paper = behind.get(number);
      if (!paper) {
        paper = leaf();
        paper.material.map = blank;
        paper.back.value = blank;
        paper.bindingShade.value = 0.08;
        behind.set(number, paper);
      }
      paper.mesh.visible = true;
      paper.mesh.position.set(FOLDED_HINGE_X, 0, -COVER_REST_DEPTH);
      if (number > page && baseStart && baseEnd) {
        packetPoses.set(number, {
          from: poseDifference(packetStart(paper, number - page), baseStart),
          to: poseDifference(
            captureFoldPose(paper, number, count + turnSpan), baseEnd,
          ),
        });
        continue;
      }
      const previous = behindPoses.get(number);
      if (previous?.count === count && previous.span === turnSpan) continue;
      // Both directions reuse the same packet endpoints, including all of
      // the sheets that join or leave the rear stack in one turn.
      const from = previous && previous.count + previous.span === count
        ? previous.to : captureFoldPose(paper, number, count);
      const to = previous?.count === count + turnSpan
        ? previous.from : captureFoldPose(paper, number, count + turnSpan);
      behindPoses.set(number, { count, span: turnSpan, from, to, blend: -1 });
    }
  }

  function settleFoldedPages(blend: number) {
    // Ease between complete spine curves, rather than bending only the tips.
    // Geometry and lighting reach the next resting pose before the handoff.
    behind.forEach((paper, number) => {
      if (!paper.mesh.visible || packetPoses.has(number)) return;
      const pose = behindPoses.get(number)!;
      if (pose.blend === blend) return;
      const points = paper.geometry.attributes
        .position as THREE.BufferAttribute;
      const normals = paper.geometry.attributes.normal as THREE.BufferAttribute;
      for (let index = 0; index < points.array.length; index++) {
        points.array[index] = THREE.MathUtils.lerp(
          pose.from.positions[index],
          pose.to.positions[index],
          blend,
        );
        normals.array[index] = THREE.MathUtils.lerp(
          pose.from.normals[index],
          pose.to.normals[index],
          blend,
        );
      }
      points.needsUpdate = true;
      normals.needsUpdate = true;
      pose.blend = blend;
    });
  }

  function render(progress = 0) {
    if (isDisposed) return;
    // Drive the turn by its angle. The cone's original parameter accelerates
    // early and barely moves near 1, which delayed the start of reverse turns.
    const curl = 1 - Math.sqrt(1 - THREE.MathUtils.clamp(progress, 0, 1));
    // Once the written face turns away, the exposed folded strip is plain
    // paper. It already matches the resting stack before the turn commits.
    sheet.faceInk.value = 1 - smooth((progress - 0.45) / 0.1);
    sheet.bindingShade.value = openingCover
      ? 0.04
      : 0.035 + 0.045 * smooth(progress);
    // Seat the hinge progressively, rather than pulling it backward during
    // the final few frames. Use the turn angle, not the cone's warped input.
    const landing = smoother((progress - 0.3) / 0.7);
    const stackBlend = smoother((progress - 0.22) / 0.78);
    const foldedCount = Math.max(0, sheetPage - 1) + turnSpan * stackBlend;
    const movingFold = loadedFoldPosition(sheetPage, foldedCount);
    shapeSheet(
      sheet.geometry,
      curl,
      openingCover ? COVER_FOLD_RADIUS : paperFoldRadius(movingFold),
      openingCover ? 0.095 : 0.075,
      grab,
      openingCover ? COVER_CORNER : PAPER_CORNER,
      foldedRise(movingFold) * landing,
      openingCover ? 1.028 : 1,
      openingCover ? ASPECT * 1.025 : ASPECT,
    );
    // All folds share a hinge. Increasing radii put the rear panels farther
    // behind the cover without translating their curves through one another.
    sheet.mesh.position.z = -COVER_REST_DEPTH * landing;
    sheet.mesh.position.x = openingCover
      ? THREE.MathUtils.lerp(-0.008, FOLDED_HINGE_X, landing)
      : FOLDED_HINGE_X * landing;
    if (openingCover) movingEdge.update();
    // Every leaf reaches its next resting depth before the page index changes.
    // This avoids a tiny jump in the stack and in the newly revealed sheet.
    pile.forEach((leaf, index) => {
      if (!leaf.mesh.visible) return;
      const depth = index + turnSpan * (1 - progress);
      leaf.bindingShade.value = 0.035 + 0.004 * Math.min(depth, 5);
      leaf.mesh.position.z = -depth * 0.0012;
      shapeSheet(leaf.geometry, 0, radius, 0.075 / (1 + depth * 0.5));
    });
    settleFoldedPages(stackBlend);
    // Inner sheets follow the outer leaf's curl as a packet. Small normal
    // offsets expose the paper edges; endpoint deltas seat every sheet in
    // its own fold, avoiding a fan jump when the new page commits.
    const outerPoints = sheet.geometry.attributes.position;
    const outerNormals = sheet.geometry.attributes.normal;
    packetPoses.forEach((pose, number) => {
      const paper = behind.get(number)!;
      const points = paper.geometry.attributes.position;
      const normals = paper.geometry.attributes.normal;
      const fan = (number - sheetPage) * 0.0008 * Math.sin(Math.PI * progress);
      for (let i = 0; i < points.array.length; i++) {
        points.array[i] = outerPoints.array[i] +
          THREE.MathUtils.lerp(pose.from.positions[i], pose.to.positions[i], stackBlend) -
          outerNormals.array[i] * fan;
        normals.array[i] = outerNormals.array[i] +
          THREE.MathUtils.lerp(pose.from.normals[i], pose.to.normals[i], stackBlend);
      }
      points.needsUpdate = true;
      normals.needsUpdate = true;
      paper.mesh.position.copy(sheet.mesh.position);
      paper.bindingShade.value = sheet.bindingShade.value;
    });
    renderer.render(scene, camera);
  }

  return {
    groundFootprint,
    setPages(
      front: HTMLElement,
      bottom?: HTMLElement,
      page = 0,
      cover?: HTMLElement,
      pageCount = page + 2,
      span = 1,
    ) {
      if (cover) {
        const stockImage = cover.querySelector<HTMLImageElement>(".cover-stock-image");
        const key = `${stockImage?.currentSrc || stockImage?.src || "plain"}:${stockImage?.complete && !!stockImage.naturalWidth}`;
        if (!coverTexture || key !== coverTextureKey) {
          coverTexture?.dispose();
          liningTexture?.dispose();
          coverTexture = paperTexture(cover, width, height);
          liningTexture = paperTexture(cover, width, height, false);
          coverTextureKey = key;
        }
      }
      openingCover = page === 0;
      sheetPage = page;
      turnSpan = openingCover
        ? 1
        : Math.max(1, Math.min(span, pageCount - page - 1));
      prepareFoldPositions(pageCount);
      const next = [paperTexture(front, width, height)];
      next.push(bottom ? paperTexture(bottom, width, height) : blank);
      radius = paperFoldRadius(foldPosition(page));
      sheet.material.map = next[0];
      sheet.back.value = openingCover ? liningTexture || blank : blank;
      sheet.material.roughness = openingCover ? 0.98 : 0.82;
      sheet.material.specularIntensity = openingCover ? 0.25 : 0.85;
      sheet.material.envMapIntensity = 0;
      sheet.material.clearcoat = openingCover ? 0 : 0.12;
      sheet.material.metalness = 0;
      sheet.paperFill.value = openingCover ? 0 : 0.45;
      sheet.mesh.position.set(openingCover ? -0.008 : 0, 0, 0);
      movingEdge.mesh.visible = openingCover;
      foldedCover.mesh.visible = !openingCover;
      for (const coverLeaf of [foldedCover, backCover]) {
        coverLeaf.bindingShade.value = 0.04;
        coverLeaf.material.roughness = 0.98;
        coverLeaf.material.specularIntensity = 0.25;
        coverLeaf.material.envMapIntensity = 0;
        coverLeaf.material.clearcoat = 0;
        coverLeaf.material.metalness = 0;
        coverLeaf.paperFill.value = 0;
        coverLeaf.material.map = coverTexture || blank;
        coverLeaf.back.value = liningTexture || blank;
      }
      foldedCover.mesh.position.set(FOLDED_HINGE_X, 0, -COVER_REST_DEPTH);
      foldedCover.faceInk.value = 0;
      shapeSheet(
        foldedCover.geometry,
        1,
        COVER_FOLD_RADIUS,
        0,
        0,
        COVER_CORNER,
        0,
        1.028,
        ASPECT * 1.025,
      );
      foldedEdge.update();
      backCover.material.map = liningTexture || blank;
      // The back board sits behind the shared binding. Placing it between
      // the readable leaf and the folded roots exposed a colored seam.
      backCover.mesh.position.set(-0.008, 0, -COVER_REST_DEPTH - 0.004);
      shapeSheet(
        backCover.geometry,
        0,
        0.07,
        0.006,
        0,
        COVER_CORNER,
        0,
        1.035,
        ASPECT * 1.045,
      );
      backEdge.update();
      for (let i = 0; i < pile.length; i++) {
        const leaf = pile[i];
        leaf.mesh.visible = i < pageCount - page - turnSpan;
        leaf.material.map = i === 0 ? next[1] : blank;
        leaf.back.value = blank;
        leaf.mesh.position.z = -(i + turnSpan) * 0.0012;
        shapeSheet(leaf.geometry, 0, radius, 0.075 / (1 + (i + turnSpan) * 0.5));
      }
      prepareFoldedPages(page);
      textures.forEach((texture) => {
        if (texture !== blank) texture.dispose();
      });
      textures = next;
    },
    setGrab(y: number) {
      grab = THREE.MathUtils.clamp(y, -1, 1);
    },
    render,
    dispose() {
      isDisposed = true;
      textures.forEach((texture) => {
        if (texture !== blank) texture.dispose();
      });
      blank.dispose();
      stock.dispose();
      coverTexture?.dispose();
      liningTexture?.dispose();
      movingEdge.dispose();
      foldedEdge.dispose();
      backEdge.dispose();
      [...leaves, ...behind.values()].forEach(({ geometry, material }) => {
        geometry.dispose();
        material.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
