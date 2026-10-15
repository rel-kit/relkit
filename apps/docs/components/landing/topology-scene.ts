import {
  BoxGeometry,
  BufferGeometry,
  Color,
  EdgesGeometry,
  GridHelper,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { TopologyScene } from "./topology-controller";
import styles from "./topology.module.css";

/** Original RELKIT topology; sparse cell outlines are inspired by ns-ui's
 * Delta Frame Macroblock. No reference implementation or assets are copied.
 */
export function createTopologyScene(host: HTMLDivElement): TopologyScene {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  const scene = new Scene();
  const camera = new OrthographicCamera();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<LineBasicMaterial | MeshBasicMaterial>();
  const labels: HTMLSpanElement[] = [];
  let tiles: InstancedMesh | undefined;
  const ownGeometry = <T extends BufferGeometry>(geometry: T): T => {
    geometries.add(geometry);
    return geometry;
  };
  const ownMaterial = <T extends LineBasicMaterial | MeshBasicMaterial>(material: T): T => {
    materials.add(material);
    return material;
  };
  renderer.setClearColor(0xfafafa);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  camera.position.set(10, 12, 14);
  camera.lookAt(0, 0, 0);
  camera.near = 0.1;
  camera.far = 100;
  camera.updateProjectionMatrix();

  try {
    const grid = new GridHelper(10.8, 18, 0xd4d4d4, 0xe5e5e5);
    geometries.add(grid.geometry);
    for (const material of Array.isArray(grid.material) ? grid.material : [grid.material])
      materials.add(material);
    scene.add(grid);
    const tileGeometry = ownGeometry(new PlaneGeometry(0.58, 0.58));
    const tileMaterial = ownMaterial(new MeshBasicMaterial());
    tiles = new InstancedMesh(tileGeometry, tileMaterial, 18 * 18);
    const matrix = new Matrix4();
    const color = new Color();
    for (let index = 0; index < 18 * 18; index++) {
      matrix.makeRotationX(-Math.PI / 2);
      matrix.setPosition((index % 18) * 0.6 - 5.1, -0.01, Math.floor(index / 18) * 0.6 - 5.1);
      tiles.setMatrixAt(index, matrix);
      const tone = 0.92 + ((index * 37) % 13) / 180;
      tiles.setColorAt(index, color.setRGB(tone, tone, tone));
    }
    scene.add(tiles);

    const center = new Vector3(0, 0.3, 0);
    const nodes = [
      new Vector3(-2.4, 0.3, -2.4),
      new Vector3(2.4, 0.3, -2.4),
      center,
      new Vector3(-2.4, 0.3, 2.4),
      new Vector3(2.4, 0.3, 2.4),
    ];
    const nodeGeometry = ownGeometry(new BoxGeometry(1.05, 0.42, 1.05));
    const edges = ownGeometry(new EdgesGeometry(nodeGeometry));
    const edgeMaterial = ownMaterial(new LineBasicMaterial({ color: 0x929292 }));
    const nodeMaterial = ownMaterial(new MeshBasicMaterial({ color: 0xf5f5f5 }));
    const centerMaterial = ownMaterial(new MeshBasicMaterial({ color: 0x262626 }));
    for (const [index, position] of nodes.entries()) {
      const node = new Group();
      node.add(new Mesh(nodeGeometry, index === 2 ? centerMaterial : nodeMaterial));
      node.add(new LineSegments(edges, edgeMaterial));
      node.position.copy(position);
      scene.add(node);
    }
    const markGeometry = ownGeometry(new PlaneGeometry(0.2, 0.2));
    const markMaterial = ownMaterial(new MeshBasicMaterial({ color: 0xffffff }));
    for (const [x, z] of [
      [-0.15, -0.15],
      [-0.15, 0.15],
      [0.15, -0.15],
      [0.15, 0.15],
    ]) {
      const mark = new Mesh(markGeometry, markMaterial);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(x!, 0.515, z!);
      scene.add(mark);
    }

    const connectionPoints: Vector3[] = [];
    const endpoints = nodes.filter((node) => node !== center);
    for (const node of endpoints) {
      const bend = new Vector3(node.x, center.y, 0);
      connectionPoints.push(center, bend, bend, node);
    }
    const connections = ownGeometry(new BufferGeometry().setFromPoints(connectionPoints));
    scene.add(
      new LineSegments(connections, ownMaterial(new LineBasicMaterial({ color: 0xa3a3a3 }))),
    );
    const packetGeometry = ownGeometry(new BoxGeometry(0.1, 0.1, 0.1));
    const packetMaterial = ownMaterial(new MeshBasicMaterial({ color: 0x525252 }));
    const packets = endpoints.map(() => {
      const packet = new Mesh(packetGeometry, packetMaterial);
      scene.add(packet);
      return packet;
    });
    const outlineGeometry = ownGeometry(
      new BufferGeometry().setFromPoints([
        new Vector3(-0.29, 0.02, -0.29),
        new Vector3(0.29, 0.02, -0.29),
        new Vector3(0.29, 0.02, 0.29),
        new Vector3(-0.29, 0.02, 0.29),
      ]),
    );
    const outlines = Array.from({ length: 3 }, () => {
      const outline = new LineLoop(
        outlineGeometry,
        ownMaterial(new LineBasicMaterial({ color: 0x737373, transparent: true })),
      );
      scene.add(outline);
      return outline;
    });
    host.appendChild(renderer.domElement);
    for (const name of ["Routes", "Functions", "Services", "Events", "Resources"]) {
      const label = document.createElement("span");
      label.className = styles.nodeLabel!;
      label.textContent = name;
      labels.push(label);
      host.appendChild(label);
    }

    return {
      resize() {
        const { width, height } = host.getBoundingClientRect();
        if (width < 1 || height < 1) return;
        const aspect = width / height;
        camera.left = -5.6 * aspect;
        camera.right = 5.6 * aspect;
        camera.top = 5.6;
        camera.bottom = -5.6;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        renderer.setSize(width, height, false);
        for (const [index, node] of nodes.entries()) {
          const anchor = node.clone().project(camera);
          labels[index]!.style.left = `${(anchor.x + 1) * 50}%`;
          const labelY = ((1 - anchor.y) * height) / 2 + (index < 2 ? -24 : 20);
          labels[index]!.style.top = `${labelY}px`;
        }
      },
      render(elapsed) {
        for (const [index, packet] of packets.entries()) {
          const progress = ((elapsed / 4200 + index / 4) % 1) * 2;
          const target = endpoints[index]!;
          const bend = new Vector3(target.x, center.y, 0);
          packet.position.lerpVectors(
            progress < 1 ? center : bend,
            progress < 1 ? bend : target,
            progress % 1,
          );
        }
        const tick = Math.floor(elapsed / 1100);
        for (const [index, outline] of outlines.entries()) {
          const cell = (tick * 43 + index * 89 + 17) % 324;
          outline.position.set((cell % 18) * 0.6 - 5.1, 0, Math.floor(cell / 18) * 0.6 - 5.1);
          outline.material.opacity = 0.2 + 0.35 * Math.max(0, 1 - (elapsed % 1100) / 900);
        }
        renderer.render(scene, camera);
      },
      dispose() {
        for (const geometry of geometries) geometry.dispose();
        for (const material of materials) material.dispose();
        tiles?.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
        for (const label of labels) label.remove();
      },
    };
  } catch (error) {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    tiles?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    for (const label of labels) label.remove();
    renderer.domElement.remove();
    throw error;
  }
}
