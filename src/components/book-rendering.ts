import * as THREE from 'three';
import { BOOK_LIGHT } from '../sketch/lighting';
import { PAGE_ASPECT } from '../sketch/geometry';
const ASPECT = PAGE_ASPECT;
export function createBookRenderer(host: HTMLElement, width: number, height: number) {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.replaceChildren(renderer.domElement);
    return renderer;
}
export function addBookLight(scene: THREE.Scene, targetX = 0) {
    const light = new THREE.DirectionalLight(0xffffff, 3.6);
    light.target.position.set(targetX, 0, 0);
    light.position.copy(light.target.position).add(new THREE.Vector3(BOOK_LIGHT.x, BOOK_LIGHT.y, BOOK_LIGHT.z).multiplyScalar(4));
    light.castShadow = false;
    scene.add(light.target, light);
}
/** Stable UV-bound microfibres: identical on the moving and resting sheets. */
export function paperStock() {
    const size = 512;
    const pixels = new Uint8Array(size * size * 4);
    const random = (x: number, y: number) => {
        let seed = Math.imul(x + 17, 374761393) ^ Math.imul(y + 53, 668265263);
        seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
        return ((seed ^ (seed >>> 16)) >>> 0) / 4294967295;
    };
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const fibre = random(Math.floor(x / 3), y);
            const grain = random(x, y) * 0.7 + fibre * 0.3;
            const offset = (y * size + x) * 4;
            pixels[offset] =
                pixels[offset + 1] =
                    pixels[offset + 2] =
                        Math.round(255 * (0.22 + grain * 0.56));
            pixels[offset + 3] = 255;
        }
    }
    const texture = new THREE.DataTexture(pixels, size, size);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, PAGE_ASPECT);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}
/** Capture a sketchbook leaf. DOM remains the accessible source of truth. */
export function paperTexture(element: HTMLElement, width: number, height: number, ink = true, maxScale = 3) {
    const canvas = document.createElement("canvas");
    const scale = Math.min(maxScale, Math.max(2, window.devicePixelRatio));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    const isCover = !!element.querySelector(".mobile-book-cover");
    const palette = getComputedStyle(element);
    const coverColor = palette.getPropertyValue("--sketchbook-cover").trim();
    const paperColor = palette.getPropertyValue("--sketchbook-paper").trim();
    ctx.fillStyle = isCover ? coverColor : paperColor;
    ctx.fillRect(0, 0, width, height);
    if (isCover) {
        // A pressed hinge in coated stock, without the previous woven-cloth grid.
        const hinge = ctx.createLinearGradient(0, 0, 20, 0);
        hinge.addColorStop(0, "rgba(0, 0, 0, .22)");
        hinge.addColorStop(0.55, "rgba(0, 0, 0, .04)");
        hinge.addColorStop(0.72, "rgba(255, 255, 255, .025)");
        hinge.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = hinge;
        ctx.fillRect(0, 0, 20, height);
    }
    const origin = element.getBoundingClientRect();
    // Use the actual line breaks and font metrics instead of reflowing text on canvas.
    function paint(node: HTMLElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden")
            return;
        const rect = node.getBoundingClientRect();
        ctx.save();
        // The source wrapper is hidden once WebGL is ready; its content is not.
        if (node !== element)
            ctx.globalAlpha *= parseFloat(style.opacity);
        if (["auto", "scroll", "hidden"].includes(style.overflowY)) {
            ctx.beginPath();
            ctx.rect(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height);
            ctx.clip();
        }
        for (const side of ["Top", "Bottom"] as const) {
            const size = parseFloat(style[`border${side}Width`]);
            if (size) {
                ctx.fillStyle = style[`border${side}Color`];
                ctx.fillRect(rect.left - origin.left, (side === "Top" ? rect.top : rect.bottom - size) - origin.top, rect.width, size);
            }
        }
        if (node instanceof HTMLImageElement && node.complete && node.naturalWidth) {
            const fit = (style.objectFit === "cover" ? Math.max : Math.min)(rect.width / node.naturalWidth, rect.height / node.naturalHeight);
            const width = node.naturalWidth * fit, height = node.naturalHeight * fit;
            ctx.save();
            ctx.globalCompositeOperation = node.classList.contains("cover-stock-image") ? "source-over" : "multiply";
            ctx.drawImage(node, rect.left - origin.left + (rect.width - width) / 2, rect.top - origin.top + (rect.height - height) / 2, width, height);
            ctx.restore();
        }
        for (const child of node.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                paint(child as HTMLElement);
            }
            else if (child.nodeType === Node.TEXT_NODE &&
                child.textContent?.trim()) {
                ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
                ctx.fillStyle = style.color;
                ctx.textBaseline = "alphabetic";
                const metrics = ctx.measureText("Hg");
                const ascent = metrics.fontBoundingBoxAscent ?? parseFloat(style.fontSize) * 0.85;
                const text = child.textContent;
                const range = document.createRange();
                // Locate line breaks with ranges, then draw whole runs to preserve handwriting ligatures.
                ctx.letterSpacing =
                    style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
                let start = 0;
                let top: number | null = null;
                const drawRun = (end: number) => {
                    if (end <= start || !text.slice(start, end).trim())
                        return;
                    range.setStart(child, start);
                    range.setEnd(child, end);
                    const box = range.getBoundingClientRect();
                    ctx.fillText(text.slice(start, end), box.left - origin.left, box.top - origin.top + ascent);
                };
                let index = 0;
                for (const character of text) {
                    range.setStart(child, index);
                    range.setEnd(child, index + character.length);
                    const box = range.getBoundingClientRect();
                    if (box.width && top !== null && Math.abs(box.top - top) > 2) {
                        drawRun(index);
                        start = index;
                    }
                    if (box.width)
                        top = box.top;
                    index += character.length;
                }
                drawRun(text.length);
            }
        }
        ctx.restore();
    }
    if (ink || isCover)
        paint(element);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}
export function createPaperMaterial(blank: THREE.Texture, stock: THREE.Texture) {
    const back = { value: blank as THREE.Texture };
    const faceInk = { value: 1 };
    const bindingShade = { value: 0.1 };
    const paperFill = { value: 0.45 };
    const material = new THREE.MeshPhysicalMaterial({
        map: blank,
        side: THREE.DoubleSide,
        metalness: 0,
        roughness: 0.82,
        specularIntensity: 0.85,
        clearcoat: 0.12,
        clearcoatRoughness: 0.28,
        envMap: null,
        envMapIntensity: 0,
        bumpMap: stock,
        bumpScale: 0.0003,
    });
    material.onBeforeCompile = (shader) => {
        shader.uniforms.backMap = back;
        shader.uniforms.faceInkAmount = faceInk;
        shader.uniforms.bindingShade = bindingShade;
        shader.uniforms.paperFill = paperFill;
        shader.uniforms.stockMap = { value: stock };
        shader.fragmentShader =
            "uniform sampler2D backMap; uniform sampler2D stockMap; uniform float faceInkAmount; uniform float bindingShade; uniform float paperFill;\n" +
                shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
    vec4 frontInk = mix(texture2D(backMap, vMapUv), texture2D(map, vMapUv), faceInkAmount);
    vec4 backInk = texture2D(backMap, vec2(1.0 - vMapUv.x, vMapUv.y));
    diffuseColor *= gl_FrontFacing ? frontInk : backInk;
    float stockGrain = texture2D(stockMap, vMapUv * vec2(1.0, ${ASPECT})).r;
    diffuseColor.rgb *= 1.0 + (stockGrain - 0.5) * 0.12;
    diffuseColor.rgb *= 1.0 - bindingShade * exp(-vMapUv.x * 28.0);
  `);
        shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
     roughnessFactor *= 0.92 + stockGrain * 0.16;`);
        shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
    // Approximate light scattered into a paper curl, retaining the key's
    // curvature gradient and ink contrast. Bright paper is unchanged.
    outgoingLight = mix(outgoingLight, max(outgoingLight, diffuseColor.rgb), paperFill);
    #include <opaque_fragment>
    `);
        shader.fragmentShader = shader.fragmentShader.replace("#include <clearcoat_normal_fragment_begin>", `#ifdef USE_CLEARCOAT
      // The coating smooths the fibres but retains a little of their relief.
      vec3 clearcoatNormal = normalize(mix(nonPerturbedNormal, normal, 0.35));
     #endif`);
    };
    return { material, back, faceInk, bindingShade, paperFill };
}
