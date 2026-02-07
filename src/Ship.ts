import * as THREE from 'three';

/**
 * Build a low-poly pirate / merchant ship out of simple primitives.
 * Returns a Group so it can be positioned / rotated as one unit.
 */
export function createShipMesh(
  hullColor: number,
  sailColor: number,
  scale = 1,
): THREE.Group {
  const g = new THREE.Group();

  const wood = new THREE.MeshToonMaterial({ color: hullColor });
  const sail = new THREE.MeshToonMaterial({ color: sailColor, side: THREE.DoubleSide });
  const dark = new THREE.MeshToonMaterial({ color: 0x1e120a });
  const deck = new THREE.MeshToonMaterial({ color: 0xc4a060 });

  // ---- Hull body ----
  const hullGeo = new THREE.BoxGeometry(1.3, 0.55, 3.6);
  const hull = new THREE.Mesh(hullGeo, wood);
  hull.position.y = 0.1;
  g.add(hull);

  // ---- Keel (darker, narrower) ----
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 3.9), dark);
  keel.position.y = -0.18;
  g.add(keel);

  // ---- Bow (front wedge) ----
  const bowGeo = new THREE.ConeGeometry(0.65, 1.3, 4);
  bowGeo.rotateX(Math.PI / 2);
  const bow = new THREE.Mesh(bowGeo, wood);
  bow.position.set(0, 0.08, 2.35);
  g.add(bow);

  // ---- Stern (back wedge, flatter) ----
  const sternGeo = new THREE.ConeGeometry(0.6, 0.7, 4);
  sternGeo.rotateX(-Math.PI / 2);
  const stern = new THREE.Mesh(sternGeo, wood);
  stern.position.set(0, 0.08, -2.05);
  g.add(stern);

  // ---- Deck ----
  const deckMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 3.3), deck);
  deckMesh.position.y = 0.41;
  g.add(deckMesh);

  // ---- Main mast ----
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 4.0, 6), dark);
  mast.position.set(0, 2.4, 0.1);
  g.add(mast);

  // ---- Main sail ----
  const mainSail = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.2), sail);
  mainSail.position.set(0, 2.2, 0.1);
  g.add(mainSail);

  // ---- Secondary mast (smaller, forward) ----
  const mast2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 2.8, 6), dark);
  mast2.position.set(0, 1.8, 1.3);
  g.add(mast2);

  // ---- Fore sail ----
  const foreSail = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), sail);
  foreSail.position.set(0, 1.6, 1.3);
  g.add(foreSail);

  // ---- Jib (triangular front sail) ----
  const jibGeo = new THREE.BufferGeometry();
  const jibVerts = new Float32Array([
    0, 3.2, 1.3,
    0, 0.8, 1.3,
    0, 0.6, 2.9,
  ]);
  jibGeo.setAttribute('position', new THREE.BufferAttribute(jibVerts, 3));
  jibGeo.computeVertexNormals();
  g.add(new THREE.Mesh(jibGeo, sail));

  // ---- Stern cabin ----
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.9), wood);
  cabin.position.set(0, 0.72, -1.35);
  g.add(cabin);

  // ---- Cabin roof ----
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 1.0), dark);
  roof.position.set(0, 1.02, -1.35);
  g.add(roof);

  // ---- Railing (thin boxes along the sides) ----
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 3.0), dark);
    rail.position.set(side * 0.6, 0.56, 0);
    g.add(rail);
  }

  // ---- Flag at top of main mast ----
  const flagGeo = new THREE.PlaneGeometry(0.5, 0.3);
  const flagMat = new THREE.MeshToonMaterial({
    color: sailColor === 0xf5f0e6 ? 0x222222 : sailColor,
    side: THREE.DoubleSide,
  });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0.28, 4.3, 0.1);
  g.add(flag);

  g.scale.setScalar(scale);
  return g;
}
