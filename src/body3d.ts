import * as THREE from "three";
import type { MuscleGroup } from "./types";

/**
 * The rotatable 3D body figure for the Body Map view.
 *
 * This is the only module that imports Three.js, and the view loads it with a
 * dynamic `import("./body3d")` so WebGL/Three stays out of the initial PWA
 * bundle — the same lazy-loading pattern the spreadsheet/PDF import pipeline
 * uses for its heavy parsers.
 *
 * The body is built procedurally from primitive geometry (ellipsoids, capsules,
 * boxes) grouped by muscle, so there's no external 3D-model asset to ship.
 * Each muscle group owns one material; recolouring the map is just setting those
 * materials' colours. Neutral parts (head, hands, feet, joints) share an inert
 * material and are never recoloured. The figure spins on a finger drag (with a
 * little inertia) and idles into a slow auto-rotate; tapping a muscle reports it
 * back so the view can show that muscle's reading.
 */

/** Public handle the view drives — no Three.js types leak across this surface. */
export interface BodyScene {
  /** The renderer canvas to mount into the stage. */
  readonly el: HTMLCanvasElement;
  /** Paint each muscle from a `muscle → CSS colour` map (missing = left as-is). */
  setColors(colors: Map<MuscleGroup, string>): void;
  /** Notified when a muscle is tapped, or null when empty space is tapped. */
  onPick(cb: (muscle: MuscleGroup | null) => void): void;
  /** Re-fit the renderer/camera to a new pixel size. */
  resize(width: number, height: number): void;
  /** Tear down listeners, the animation loop and all GPU resources. */
  dispose(): void;
}

/** One primitive that belongs to a muscle group (recolourable) or is neutral. */
interface PartSpec {
  geo: THREE.BufferGeometry;
  pos: readonly [number, number, number];
  /** Per-axis stretch — turns a unit sphere into a muscle-shaped ellipsoid. */
  scale?: readonly [number, number, number];
  /** Euler rotation (radians), e.g. to fan the lats out into a V. */
  rot?: readonly [number, number, number];
  /** Owning muscle, or undefined for inert structural parts. */
  muscle?: MuscleGroup;
}

const NEUTRAL_COLOR = 0x6f6a60;
const TILT_LIMIT = 0.6; // clamp vertical rotation so the body can't flip over
const DRAG_SPEED = 0.01; // radians of spin per pixel dragged
const AUTO_SPIN = 0.0045; // idle auto-rotate, radians per frame
const IDLE_MS = 2500; // resume auto-rotate this long after the last drag
const TAP_SLOP = 6; // px of movement still counted as a tap, not a drag

/**
 * Build the full set of body parts. Front faces +z; the group is auto-centred.
 * Muscles are ellipsoids laid over a neutral frame — paired pecs, lats fanned
 * into a V, a segmented core, erectors either side of the spine, calves bulging
 * behind the shins — so each colour patch reads as the muscle it stands for.
 */
function buildParts(): PartSpec[] {
  const cap = (r: number, len: number): THREE.CapsuleGeometry =>
    new THREE.CapsuleGeometry(r, len, 10, 20);
  const box = (w: number, h: number, d: number): THREE.BoxGeometry =>
    new THREE.BoxGeometry(w, h, d);
  // One shared-shape unit sphere per part; `scale` makes it an ellipsoid.
  const unit = (): THREE.SphereGeometry => new THREE.SphereGeometry(1, 28, 20);
  const blob = (
    pos: readonly [number, number, number],
    scale: readonly [number, number, number],
    muscle?: MuscleGroup,
    rot?: readonly [number, number, number],
  ): PartSpec => ({
    geo: unit(),
    pos,
    scale,
    ...(rot ? { rot } : {}),
    ...(muscle ? { muscle } : {}),
  });
  // Both sides of a symmetric part: `x` is the right-hand offset; a z-rotation
  // is mirrored so a fanned pair opens the same way on each side.
  const pair = (
    x: number,
    y: number,
    z: number,
    scale: readonly [number, number, number],
    muscle: MuscleGroup,
    rotZ = 0,
  ): PartSpec[] => [
    blob([-x, y, z], scale, muscle, rotZ !== 0 ? [0, 0, -rotZ] : undefined),
    blob([x, y, z], scale, muscle, rotZ !== 0 ? [0, 0, rotZ] : undefined),
  ];

  return [
    // — structural / neutral frame —
    blob([0, 3.04, 0], [0.29, 0.35, 0.31]), // head
    { geo: cap(0.13, 0.18), pos: [0, 2.74, -0.02] }, // neck
    blob([0, 2.12, 0], [0.5, 0.5, 0.28]), // rib cage
    blob([0, 1.62, 0], [0.4, 0.42, 0.25]), // waist
    blob([0, 1.17, 0], [0.4, 0.24, 0.26]), // pelvis
    blob([-0.8, 1.62, 0], [0.11, 0.11, 0.11]), // left elbow
    blob([0.8, 1.62, 0], [0.11, 0.11, 0.11]), // right elbow
    blob([-0.9, 0.93, 0.04], [0.09, 0.13, 0.07]), // left hand
    blob([0.9, 0.93, 0.04], [0.09, 0.13, 0.07]), // right hand
    blob([-0.28, 0.05, 0.04], [0.13, 0.13, 0.13]), // left knee
    blob([0.28, 0.05, 0.04], [0.13, 0.13, 0.13]), // right knee
    { geo: cap(0.09, 0.78), pos: [-0.28, -0.48, 0.03] }, // left shin
    { geo: cap(0.09, 0.78), pos: [0.28, -0.48, 0.03] }, // right shin
    { geo: box(0.22, 0.14, 0.48), pos: [-0.28, -1.1, 0.12] }, // left foot
    { geo: box(0.22, 0.14, 0.48), pos: [0.28, -1.1, 0.12] }, // right foot

    // — torso front: pecs over the rib cage, a 3×2 segmented core —
    ...pair(0.2, 2.24, 0.2, [0.23, 0.16, 0.1], "chest", -0.12),
    ...[1.84, 1.65, 1.46].flatMap((y) => pair(0.09, y, 0.21, [0.085, 0.08, 0.06], "core")),

    // — torso back: traps over the neck, lats fanned into a V, erectors —
    blob([0, 2.46, -0.1], [0.36, 0.15, 0.17], "traps"),
    ...pair(0.27, 2.06, -0.18, [0.2, 0.36, 0.1], "back", 0.32),
    ...pair(0.1, 1.6, -0.21, [0.075, 0.3, 0.06], "lower-back"),

    // — deltoids: front (+z), side (outer) and rear (-z) heads per shoulder —
    ...pair(0.56, 2.4, 0.11, [0.13, 0.15, 0.1], "front-delts"),
    ...pair(0.67, 2.38, 0, [0.12, 0.16, 0.12], "side-delts"),
    ...pair(0.56, 2.4, -0.11, [0.13, 0.15, 0.1], "rear-delts"),

    // — arms: biceps (front) / triceps (back) / forearms tapering to the wrist —
    ...pair(0.74, 1.96, 0.07, [0.1, 0.25, 0.1], "biceps"),
    ...pair(0.74, 1.98, -0.07, [0.1, 0.27, 0.1], "triceps"),
    ...pair(0.85, 1.32, 0.03, [0.09, 0.3, 0.09], "forearms", 0.08),

    // — hips / legs: glutes, thighs tapering to the knee, calves behind the shin —
    ...pair(0.17, 1.03, -0.14, [0.2, 0.2, 0.16], "glutes"),
    ...pair(0.28, 0.58, 0.03, [0.2, 0.5, 0.2], "legs"),
    ...pair(0.28, -0.3, -0.06, [0.11, 0.3, 0.12], "calves"),
  ];
}

/**
 * Create the body scene. Throws if WebGL is unavailable, so the caller can fall
 * back to a flat view.
 */
export function createBodyScene(initialSize = 320): BodyScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(initialSize, initialSize);
  // A soft contact shadow under the figure grounds it; PCFSoft keeps the edge gentle.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

  // Soft sky/ground ambient, a warm key that casts the shadow, a cool back rim for
  // edge separation, and a gentle front fill so the muscles facing us aren't flat.
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x3a3833, 0.95));
  const key = new THREE.DirectionalLight(0xfff4e2, 1.35);
  key.position.set(2.5, 5, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0008;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdce6ff, 0.55);
  rim.position.set(-3, 1.5, -2.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.3);
  fill.position.set(-1, -0.5, 4);
  scene.add(fill);

  const body = new THREE.Group();
  scene.add(body);

  const neutralMat = new THREE.MeshStandardMaterial({ color: NEUTRAL_COLOR, roughness: 0.85 });
  const regionMats = new Map<MuscleGroup, THREE.MeshStandardMaterial>();
  const meshMuscle = new Map<THREE.Object3D, MuscleGroup>();
  const pickable: THREE.Mesh[] = [];
  const owned: THREE.BufferGeometry[] = [];

  for (const part of buildParts()) {
    owned.push(part.geo);
    let material: THREE.MeshStandardMaterial;
    if (part.muscle) {
      material = regionMats.get(part.muscle) ?? new THREE.MeshStandardMaterial({ roughness: 0.7 });
      regionMats.set(part.muscle, material);
    } else {
      material = neutralMat;
    }
    const mesh = new THREE.Mesh(part.geo, material);
    mesh.position.set(part.pos[0], part.pos[1], part.pos[2]);
    if (part.scale) mesh.scale.set(part.scale[0], part.scale[1], part.scale[2]);
    if (part.rot) mesh.rotation.set(part.rot[0], part.rot[1], part.rot[2]);
    mesh.castShadow = true;
    if (part.muscle) {
      meshMuscle.set(mesh, part.muscle);
      pickable.push(mesh);
    }
    body.add(mesh);
  }

  // Centre the figure on the origin so it spins about its own middle.
  const box = new THREE.Box3().setFromObject(body);
  const center = box.getCenter(new THREE.Vector3());
  body.position.sub(center);

  // Frame the bounding sphere with a little margin.
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const fitDist = (sphere.radius * 1.15) / Math.sin((camera.fov * Math.PI) / 180 / 2);
  camera.position.set(0, 0, fitDist);
  camera.lookAt(0, 0, 0);

  // Fit the key light's shadow frustum to the figure so the contact shadow is crisp.
  const shadowCam = key.shadow.camera;
  const span = sphere.radius * 1.4;
  shadowCam.left = -span;
  shadowCam.right = span;
  shadowCam.top = span;
  shadowCam.bottom = -span;
  shadowCam.near = 0.1;
  shadowCam.far = fitDist + sphere.radius * 2;
  shadowCam.updateProjectionMatrix();

  // A transparent floor just under the feet that catches only the shadow — over the
  // paper background (canvas alpha) it reads as a soft contact shadow, nothing more.
  const floorY = box.min.y - center.y - 0.02;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 4, span * 4),
    new THREE.ShadowMaterial({ opacity: 0.16 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  scene.add(floor);

  // — interaction state —
  let rotY = 0.35; // start turned slightly so it reads as 3D
  let rotX = 0;
  let velY = 0;
  let dragging = false;
  let pointerId: number | null = null;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;
  let moved = 0;
  let lastInteract = 0;
  let pickCb: (muscle: MuscleGroup | null) => void = () => {};

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pickAt(clientX: number, clientY: number): void {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickable, false)[0];
    pickCb(hit ? meshMuscle.get(hit.object) ?? null : null);
  }

  const el = renderer.domElement;
  el.style.touchAction = "none";
  el.style.cursor = "grab";

  function onDown(e: PointerEvent): void {
    dragging = true;
    pointerId = e.pointerId;
    lastX = downX = e.clientX;
    lastY = downY = e.clientY;
    moved = 0;
    velY = 0;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
  }
  function onMove(e: PointerEvent): void {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
    rotY += dx * DRAG_SPEED;
    rotX = THREE.MathUtils.clamp(rotX + dy * DRAG_SPEED, -TILT_LIMIT, TILT_LIMIT);
    velY = dx * DRAG_SPEED;
    lastInteract = performance.now();
  }
  function endDrag(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    el.style.cursor = "grab";
    lastInteract = performance.now();
    const tap = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) < TAP_SLOP;
    if (tap) {
      velY = 0;
      pickAt(e.clientX, e.clientY);
    }
  }

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);

  // Honour the OS "reduce motion" setting: no idle turntable and no inertial
  // coast — the figure turns only while a finger is actually dragging it.
  const reducedMotion =
    typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

  function frame(): void {
    if (!dragging && reducedMotion?.matches) {
      velY = 0;
    } else if (!dragging) {
      if (Math.abs(velY) > 0.0002) {
        rotY += velY;
        velY *= 0.92; // inertial spin-down after a flick
      } else if (performance.now() - lastInteract > IDLE_MS) {
        rotY += AUTO_SPIN; // idle turntable
      }
    }
    body.rotation.y = rotY;
    body.rotation.x = rotX;
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);

  return {
    el,
    setColors(colors): void {
      for (const [muscle, mat] of regionMats) {
        const c = colors.get(muscle);
        if (c) mat.color.set(c);
      }
    },
    onPick(cb): void {
      pickCb = cb;
    },
    resize(width, height): void {
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose(): void {
      renderer.setAnimationLoop(null);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
      for (const g of owned) g.dispose();
      for (const m of regionMats.values()) m.dispose();
      neutralMat.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
    },
  };
}
