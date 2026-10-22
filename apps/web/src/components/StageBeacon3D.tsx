import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Compass, Layers } from 'lucide-react';
import {
  BoardingStage,
  NAIROBI_DEMO_STAGES,
  OriginLandmark,
  WalkingRoute,
} from '@stage/shared';

interface StageBeacon3DProps {
  origin: OriginLandmark;
  selectedStage: BoardingStage;
  walking: WalkingRoute;
  onSelectStageById: (stageId: string) => void;
}

export const StageBeacon3D: React.FC<StageBeacon3DProps> = ({
  origin,
  selectedStage,
  walking,
  onSelectStageById,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webglReady, setWebglReady] = useState<boolean>(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglReady(false);
      return;
    }

    const width = container.clientWidth || 520;
    const height = container.clientHeight || 250;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0c100e, 0.085);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 4.4, 5.4);
    camera.lookAt(0, 0, 0);

    // Subtle CBD street grid plane & concentric distance rings
    const gridHelper = new THREE.GridHelper(8, 16, 0x1e3528, 0x16221b);
    gridHelper.position.y = -0.02;
    scene.add(gridHelper);

    const ringGeo = new THREE.RingGeometry(1.45, 1.5, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00b84c,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.28,
    });
    const radarRing = new THREE.Mesh(ringGeo, ringMat);
    radarRing.rotation.x = -Math.PI / 2;
    scene.add(radarRing);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x16e065, 2.2);
    keyLight.position.set(3, 6, 4);
    scene.add(keyLight);

    // Origin Node (where the user is standing)
    const originGroup = new THREE.Group();
    originGroup.position.set(
      origin.spatialOffset3D.x,
      0,
      origin.spatialOffset3D.z
    );
    const originMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.18, 24),
      new THREE.MeshStandardMaterial({
        color: 0xf7f8f6,
        emissive: 0x3b82f6,
        emissiveIntensity: 0.45,
        roughness: 0.25,
      })
    );
    originMesh.position.y = 0.09;
    originGroup.add(originMesh);
    scene.add(originGroup);

    // Stage Pillars for all 6 Nairobi CBD Demo Stages
    const stageGroup = new THREE.Group();
    let activeBeaconMesh: THREE.Mesh | null = null;
    let pulseHaloMesh: THREE.Mesh | null = null;

    NAIROBI_DEMO_STAGES.forEach((stageItem) => {
      const isTarget = stageItem.id === selectedStage.id;
      const pillarHeight = isTarget ? 0.82 : 0.36;
      const geo = new THREE.BoxGeometry(
        isTarget ? 0.28 : 0.2,
        pillarHeight,
        isTarget ? 0.28 : 0.2
      );
      const mat = new THREE.MeshStandardMaterial({
        color: isTarget ? 0x16e065 : 0x3a4840,
        emissive: isTarget ? 0x00b84c : 0x000000,
        emissiveIntensity: isTarget ? 0.65 : 0,
        roughness: 0.25,
        metalness: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        stageItem.spatialOffset3D.x,
        pillarHeight / 2,
        stageItem.spatialOffset3D.z
      );
      stageGroup.add(mesh);

      if (isTarget) {
        activeBeaconMesh = mesh;
        const haloGeo = new THREE.RingGeometry(0.24, 0.38, 32);
        const haloMat = new THREE.MeshBasicMaterial({
          color: 0x16e065,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
        });
        pulseHaloMesh = new THREE.Mesh(haloGeo, haloMat);
        pulseHaloMesh.rotation.x = -Math.PI / 2;
        pulseHaloMesh.position.set(
          stageItem.spatialOffset3D.x,
          0.02,
          stageItem.spatialOffset3D.z
        );
        stageGroup.add(pulseHaloMesh);
      }
    });
    scene.add(stageGroup);

    // Walking Vector Line between Origin and Selected Boarding Stage
    const startVec = new THREE.Vector3(
      origin.spatialOffset3D.x,
      0.08,
      origin.spatialOffset3D.z
    );
    const endVec = new THREE.Vector3(
      selectedStage.spatialOffset3D.x,
      0.22,
      selectedStage.spatialOffset3D.z
    );
    const midVec = startVec.clone().lerp(endVec, 0.5);
    midVec.y = 0.42;

    const curve = new THREE.QuadraticBezierCurve3(startVec, midVec, endVec);
    const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.035, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x16e065,
    });
    const pathMesh = new THREE.Mesh(tubeGeo, tubeMat);
    scene.add(pathMesh);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const timer = new THREE.Timer();
    timer.connect(document);

    const activeRenderer = renderer;
    function animate() {
      timer.update();
      const elapsed = timer.getElapsed();

      if (!prefersReducedMotion) {
        scene.rotation.y = Math.sin(elapsed * 0.35) * 0.22;
        if (activeBeaconMesh) {
          activeBeaconMesh.position.y =
            0.41 + Math.sin(elapsed * 2.5) * 0.04;
        }
        if (pulseHaloMesh) {
          const scale = 1 + ((elapsed * 0.8) % 1) * 0.9;
          pulseHaloMesh.scale.set(scale, scale, 1);
          (pulseHaloMesh.material as THREE.MeshBasicMaterial).opacity =
            0.7 * (1 - ((elapsed * 0.8) % 1));
        }
      }

      activeRenderer.render(scene, camera);
    }

    activeRenderer.setAnimationLoop(animate);

    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth || 520;
      const newH = container.clientHeight || 250;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      activeRenderer.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      timer.dispose();
      activeRenderer.setAnimationLoop(null);
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else if (m.material) {
            m.material.dispose();
          }
        }
      });
      activeRenderer.dispose();
    };
  }, [origin, selectedStage]);

  return (
    <section
      className="spatial-card"
      aria-label="3D Nairobi CBD Stage Beacon and Spatial Compass"
    >
      <div className="spatial-card__header">
        <div className="spatial-card__title">
          <Layers size={16} color="#16E065" />
          Nairobi CBD 3D Spatial Stage Radar
        </div>
        <span className="spatial-card__telemetry">
          <Compass
            size={12}
            style={{ verticalAlign: 'text-bottom', marginRight: 4 }}
          />
          {walking.compassBearing} {walking.compassDegrees}° ·{' '}
          {walking.totalDistanceMeters}m
        </span>
      </div>

      <div className="spatial-canvas-wrap">
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%' }}
          aria-hidden="true"
        />
        {!webglReady && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              fontSize: 13,
              color: '#9CA69F',
            }}
          >
            Spatial Stage Vector: {origin.shortName} → {selectedStage.name} (
            {walking.totalDistanceMeters}m {walking.compassBearing})
          </div>
        )}

        <div className="spatial-overlay-legend">
          <span className="spatial-legend-chip">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#60A5FA',
              }}
            />
            Origin: {origin.shortName}
          </span>
          <span className="spatial-legend-chip">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#16E065',
              }}
            />
            Active Stage: {selectedStage.code} ({walking.estimatedMinutes} min walk)
          </span>
        </div>
      </div>

      <div
        className="spatial-stage-selector"
        role="group"
        aria-label="Inspect CBD boarding stages in 3D"
      >
        {NAIROBI_DEMO_STAGES.map((stg) => {
          const isCurrent = stg.id === selectedStage.id;
          return (
            <button
              key={stg.id}
              type="button"
              className={`spatial-stage-pill ${
                isCurrent ? 'spatial-stage-pill--active' : ''
              }`}
              onClick={() => onSelectStageById(stg.id)}
            >
              {stg.code} · {stg.name.replace(' (Demo)', '')}
            </button>
          );
        })}
      </div>
    </section>
  );
};

