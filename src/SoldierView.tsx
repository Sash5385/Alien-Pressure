import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { applyTwoHands, loadModels, spawnModel } from './render/models';
import type { ArmorId, WeaponId } from './game/types';

const GUN: Record<WeaponId, string> = { rifle: 'AK', smg: 'SMG', shotgun: 'Shotgun', sniper: 'Sniper', launcher: 'ShortCannon', mortar: 'ShortCannon', ags: 'AGS' };

/** Боец в 3D для экрана снаряжения: форма, разгрузка, броня и оружие видны на фигуре; вращается мышью или пальцем. */
export function SoldierView({ weapon, armor, width, height }: { weapon: WeaponId; armor: ArmorId; width: number; height: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false, raf = 0;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, width / height, 0.1, 50);
    cam.position.set(2.7, 1.5, 5.3);
    const ctl = new OrbitControls(cam, renderer.domElement);
    ctl.target.set(0, 0.95, 0);
    ctl.enableZoom = false; ctl.enablePan = false;
    ctl.minPolarAngle = ctl.maxPolarAngle = Math.PI / 2.15; // только вокруг фигуры
    ctl.autoRotate = true; ctl.autoRotateSpeed = 1.1; ctl.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xbfd0e6, 0x3a3328, 1.1));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.2); key.position.set(3, 4, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb4ff, 1.6); rim.position.set(-4, 2.5, -3); scene.add(rim);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.06, 40), new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.8 }));
    disc.position.y = -0.03; scene.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: 0x7ee0ff }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.005; scene.add(ring);
    let mixer: THREE.AnimationMixer | null = null;
    void loadModels(false).then(() => {
      if (dead) return;
      const sp = spawnModel('Soldier', 1.8, undefined, GUN[weapon], armor);
      if (!sp) return;
      sp.actions.get('Idle')?.play();
      sp.mixer.update(0);
      applyTwoHands(sp);
      mixer = sp.mixer;
      scene.add(sp.obj);
    });
    const loop = () => { raf = requestAnimationFrame(loop); ctl.update(); renderer.render(scene, cam); };
    loop();
    return () => {
      dead = true; cancelAnimationFrame(raf); void mixer;
      ctl.dispose(); renderer.dispose();
      scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry?.dispose(); } });
      el.removeChild(renderer.domElement);
    };
  }, [weapon, armor, width, height]);
  return <div ref={host} style={{ width, height, touchAction: 'pan-y', cursor: 'grab' }} title="Потяни, чтобы повернуть" />;
}
