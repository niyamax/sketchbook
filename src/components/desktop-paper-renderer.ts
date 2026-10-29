import * as THREE from 'three';
import { PAGE_ASPECT as H } from '../sketch/geometry';
import { BOOK_LIGHT } from '../sketch/lighting';
import { restingBookPose, turningBookPose } from '../sketch/book-pose';
import { addBookLight, createBookRenderer, createPaperMaterial, paperStock, paperTexture, createCoverEdge } from './book-rendering';
const HINGE_DEPTH=.012, HINGE_INSET=.006, HINGE_WIDTH=.055;
const CORNER = .036, COLS = 64, CORNER_ROWS = 12, ROWS = 16 + CORNER_ROWS * 2, SCALE_X = 1.35, SCALE_Y = 1.6;
export function createDesktopPaperRenderer(host: HTMLElement, width: number, height: number, sources: HTMLElement[]) {
    const renderer = createBookRenderer(host, width * 2 * SCALE_X, height * SCALE_Y);
    const camera = new THREE.PerspectiveCamera(2 * Math.atan(H * SCALE_Y / (2 * 6.2)) * 180 / Math.PI, 2 * width * SCALE_X / (height * SCALE_Y), 1, 12);
    camera.position.set(0, 0, 6.2);
    const scene = new THREE.Scene(), book = new THREE.Group();
    scene.add(book);
    addBookLight(scene);
    const stock = paperStock();
    const isCover=(index:number)=>index<2||index>=sources.length-2;
    const coverTexture=paperTexture(sources[0],width,height,true,2);
    const textures = sources.map((source,index) => isCover(index)?coverTexture:paperTexture(source, width, height, true, 2));
    const edgeColor=getComputedStyle(host).getPropertyValue('--sketchbook-cover-edge').trim()||'#080808';
    const last = (sources.length / 2), lastTurn = last - 1;
    const index = (spread: number) => spread === 0 ? 0 : spread === last ? sources.length - 1 : spread * 2 - 1;
    const pose = (spread: number) => restingBookPose(index(spread), sources.length);
    let disposed = false;
    function leaf(backing=false) {
        const geometry = new THREE.PlaneGeometry(1, H, COLS, ROWS);
        const paper = createPaperMaterial(textures[1], stock);
        const mesh = new THREE.Mesh(geometry, paper.material);
        mesh.frustumCulled = false;
        book.add(mesh);
        return { ...paper, geometry, mesh, edge:backing?null:createCoverEdge({geometry,mesh},COLS,ROWS,edgeColor,.002), cornersReady: false };
    }
    type Leaf = ReturnType<typeof leaf>;
    const left = leaf(), right = leaf(), moving = leaf(), leftBoard = leaf(true), rightBoard = leaf(true);
    const leaves = [left, right, moving, leftBoard, rightBoard];
    function configure(paper: Leaf, texture: number, cover = false, back = texture) {
        if(paper.edge)paper.edge.mesh.visible=cover;
        paper.material.map = textures[texture];
        paper.back.value = textures[back];
        paper.bindingShade.value = cover ? .04 : .035;
        paper.paperFill.value = cover ? 0 : .45;
        paper.gutter.value=cover?.08:.16;
        paper.material.roughness = cover ? .98 : .82;
        paper.material.specularIntensity = cover ? .25 : .85;
        const clearcoat = cover ? 0 : .12;
        if (!!paper.material.clearcoat !== !!clearcoat)
            paper.material.needsUpdate = true;
        paper.material.clearcoat = clearcoat;
    }
    function shape(paper: Leaf, side: -1 | 1, progress = 0, hard = false, grab = 0, oversize = 1, swell = 1) {
        const points = paper.geometry.attributes.position, uv = paper.geometry.attributes.uv;
        if (!paper.cornersReady) {
            // Sample the quarter-circle by angle, including both tangent
            // endpoints. Extra rows stay in the corners; the centre keeps
            // its original 16 rows and the curl keeps its 64 columns.
            // Matching cutouts keep underlying corners inside the cover.
            const edge = CORNER_ROWS / ROWS, radius = CORNER / H;
            const arc = (t: number) => radius * (1 - Math.cos(t * Math.PI / 2));
            for (let i = 0; i < uv.count; i++) {
                const v = 1 - Math.floor(i / (COLS + 1)) / ROWS;
                uv.setY(i, v <= edge ? arc(v / edge) : v >= 1 - edge ? 1 - arc((1 - v) / edge) : radius + (v - edge) / (1 - 2 * edge) * (1 - 2 * radius));
            }
            uv.needsUpdate = true;
            paper.cornersReady = true;
        }
        for (let i = 0; i < points.count; i++) {
            const u = uv.getX(i), v = uv.getY(i), baseY = (v - .5) * H * oversize;
            const corner = CORNER * oversize;
            const cornerY = Math.max(0, Math.abs(baseY) - (H * oversize / 2 - corner));
            const inset = corner - Math.sqrt(Math.max(0, corner * corner - cornerY * cornerY));
            const reach = u * (oversize - inset);
            const hinge=Math.exp(-reach/HINGE_WIDTH);
            const y=baseY*(1-2*HINGE_INSET*hinge/(H*oversize));
            const p = THREE.MathUtils.clamp(progress + (hard ? 0 : grab * .065 * (v - .5) * 2 * Math.sin(Math.PI * progress)), 0, 1);
            const angle = Math.PI * p, curl = hard ? 0 : .58 * Math.sin(Math.PI * p), k = -2 * curl, a = angle + curl;
            const x = Math.abs(k) < .00001 ? reach * Math.cos(angle) : (Math.sin(a + k * reach) - Math.sin(a)) / k;
            const z = Math.abs(k) < .00001 ? reach * Math.sin(angle) : (Math.cos(a) - Math.cos(a + k * reach)) / k;
            // The sheet falls into the binding and arches gently back out.
            // Relax the resting bow while upright; both landing poses match.
            const gutterRise=hard?0:.022*(1-Math.exp(-reach/.06))*Math.exp(-reach/.22);
            points.setXYZ(i, side * x, y, z-HINGE_DEPTH*hinge+gutterRise*Math.cos(Math.PI*p)**2*swell);
        }
        points.needsUpdate = true;
        paper.geometry.computeVertexNormals();
        if(paper.edge?.mesh.visible)paper.edge.update();
    }
    for (const board of [leftBoard, rightBoard]) {
        configure(board, 0, true);
        board.mesh.position.z = -.022;
        board.material.transparent = true;
        board.material.depthWrite = false;
    }
    shape(leftBoard, -1, 0, true, 0, 1.012);
    shape(rightBoard, 1, 0, true, 0, 1.012);
    left.mesh.position.z = right.mesh.position.z = .002;
    moving.mesh.position.z = .004;
    // A bounded receiving-page shade, projected from the same key light. This
    // is one inexpensive quad; it never paints onto absent paper or the floor.
    const shadeMaterial = new THREE.ShaderMaterial({
        transparent:true,depthWrite:false,
        uniforms:{extent:{value:0},strength:{value:0},leftPage:{value:1},rightPage:{value:1},leftZ:{value:0},rightZ:{value:0},leftSwell:{value:1},rightSwell:{value:1}},
        vertexShader:`varying vec2 paperUV; attribute float receiverSide; uniform float leftZ,rightZ,leftSwell,rightSwell;
          void main(){paperUV=uv;vec3 p=position;float u=abs(p.x);
          float rise=.022*(1.-exp(-u/.06))*exp(-u/.22);
          float hinge=exp(-u/${HINGE_WIDTH});p.y*=1.-2.*${HINGE_INSET}*hinge/${H};
          p.z=(receiverSide<0.?leftZ:rightZ)-${HINGE_DEPTH}*hinge+rise*(receiverSide<0.?leftSwell:rightSwell)+.0007;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
        fragmentShader:`varying vec2 paperUV; uniform float extent,strength,leftPage,rightPage;
          void main(){float x=paperUV.x*2.-1.;float e=abs(extent);
          float y=abs((paperUV.y-.5)*${H});float cy=max(0.,y-(${H}/2.-${CORNER}));
          float inset=${CORNER}-sqrt(max(0.,${CORNER*CORNER}-cy*cy));
          if(abs(x)>1.-inset)discard;
          float side=extent>=0.?step(0.,x)*rightPage:step(x,0.)*leftPage;
          float penumbra=1.-smoothstep(max(0.,e-.1),e+.08,abs(x));
          float ends=smoothstep(0.,.03,paperUV.y)*(1.-smoothstep(.97,1.,paperUV.y));
          gl_FragColor=vec4(.06,.06,.06,strength*side*penumbra*ends);}`
    });
    // Duplicate the binding column so each receiver keeps its own depth.
    const shadeGeometry=new THREE.PlaneGeometry(2,H,COLS*2+1,1);
    const shadePositions=shadeGeometry.attributes.position,shadeUV=shadeGeometry.attributes.uv;
    const receiverSides=new Float32Array(shadePositions.count);
    for(let i=0;i<shadePositions.count;i++){
        const column=i%(COLS*2+2),rightSide=column>COLS;
        const x=rightSide?(column-COLS-1)/COLS:column/COLS-1;
        shadePositions.setX(i,x);shadeUV.setX(i,(x+1)/2);receiverSides[i]=rightSide?1:-1;
    }
    shadeGeometry.setAttribute('receiverSide',new THREE.BufferAttribute(receiverSides,1));
    const shade = new THREE.Mesh(shadeGeometry,shadeMaterial);
    book.add(shade);
    let prepared = -1;
    function boards(p: ReturnType<typeof pose>) {
        book.position.x = p.center;
        leftBoard.mesh.visible = p.leftContact > 0;
        rightBoard.mesh.visible = p.rightContact > 0;
        leftBoard.material.opacity = p.leftContact;
        rightBoard.material.opacity = p.rightContact;
        // Boards are physical backing, never a detached floor rectangle.
    }
    function showRest(spread: number) {
        const p = pose(spread);
        boards(p);
        moving.mesh.visible = false;
        shade.visible = false;
        left.mesh.position.z = right.mesh.position.z = .002;
        left.mesh.visible = spread !== 0;
        right.mesh.visible = spread !== last;
        if (left.mesh.visible) {
            configure(left, spread === last ? sources.length - 1 : 2 * spread - 1, spread === 1 || spread === last);
            shape(left, -1, 0, spread === 1 || spread === last);
        }
        if (right.mesh.visible) {
            configure(right, spread === 0 ? 0 : 2 * spread, spread === 0 || spread === last-1);
            shape(right, 1, 0, spread === 0 || spread === last - 1);
        }
        prepared = -1;
        renderer.render(scene, camera);
        return p;
    }
    function showTurn(from: number, progress: number, grab = 0) {
        const p = THREE.MathUtils.clamp(progress, 0, 1), hard = from === 0 || from === lastTurn;
        if (prepared !== from) {
            prepared = from;
            left.mesh.visible = from > 0;
            right.mesh.visible = from < lastTurn;
            if (left.mesh.visible) {
                configure(left, 2 * from - 1,isCover(2*from-1));
                shape(left, -1, 0, from === 1);
            }
            if (right.mesh.visible) {
                configure(right, 2 * from + 2,isCover(2*from+2));
                shape(right, 1, 0, from === lastTurn - 1);
            }
        }
        left.mesh.visible = from > 0 && p < 1;
        right.mesh.visible = from < lastTurn && p > 0;
        // Keep the revealed sheets underneath the turning leaf, even at
        // near-zero angles. They reach their resting depth before promotion.
        // Coplanar surfaces here make inner-page ink flicker through covers.
        left.mesh.position.z = .002 - .004 * p;
        right.mesh.position.z = .002 - .004 * (1 - p);
        // Paper under a closed board is compressed flat. Let it relax only
        // as the separate cover lifts, keeping the cover fully opaque.
        const relax=(value:number)=>{const t=THREE.MathUtils.clamp(value/.35,0,1);return t*t*(3-2*t);};
        if(from===0&&right.mesh.visible&&!isCover(2*from+2))shape(right,1,0,false,0,1,relax(p));
        if(from===lastTurn&&left.mesh.visible&&!isCover(2*from-1))shape(left,-1,0,false,0,1,relax(1-p));
        configure(moving, from * 2, hard, from * 2 + 1);
        moving.mesh.visible = true;
        moving.mesh.position.z = .002 + .002 * Math.sin(Math.PI * p) ** 2;
        shape(moving, 1, p, hard, grab);
        const bookPose = turningBookPose(index(from), 0, p, sources.length);
        boards(bookPose);
        shade.visible = true;
        shadeMaterial.uniforms.extent.value = Math.cos(Math.PI * p) - BOOK_LIGHT.x * Math.sin(Math.PI * p);
        shadeMaterial.uniforms.strength.value = .075 * Math.sin(Math.PI * p) ** 2;
        shadeMaterial.uniforms.leftZ.value=left.mesh.position.z;
        shadeMaterial.uniforms.rightZ.value=right.mesh.position.z;
        shadeMaterial.uniforms.leftSwell.value=isCover(2*from-1)?0:from===lastTurn?relax(1-p):1;
        shadeMaterial.uniforms.rightSwell.value=isCover(2*from+2)?0:from===0?relax(p):1;
        shadeMaterial.uniforms.leftPage.value = left.mesh.visible ? 1 : 0;
        shadeMaterial.uniforms.rightPage.value = right.mesh.visible ? 1 : 0;
        renderer.render(scene, camera);
        return bookPose;
    }
    return { showRest, showTurn, dispose() { if (disposed)
            return; disposed = true; for (const leaf of leaves) {
            leaf.edge?.dispose();
            leaf.geometry.dispose();
            leaf.material.dispose();
        } shade.geometry.dispose(); shadeMaterial.dispose(); new Set(textures).forEach(t => t.dispose()); stock.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); } };
}
