import { MathUtils } from 'three';
import { HOPPING_MOVEMENT } from './movement.js';

const mix = MathUtils.lerp;

/** Pose only: the authority's position, collisions and dig cell never change. */
export function poseSquirrel(squirrel, {
  dt, animate, moving, carrying, digging, climb = 0, climbPitch = 0, speed = 7,
}) {
  if (animate) squirrel.motionTime += dt;
  const time = squirrel.motionTime;
  const quadruped = climb;
  const blend = 1 - Math.exp(-dt * 18);
  squirrel.poseBlend = mix(squirrel.poseBlend, quadruped, blend);
  // A climbing pose is immediate, so the first frame already grips the bark.
  const q = climb > 0 ? quadruped : squirrel.poseBlend;
  const stride = time * 12;
  const gait = time * 21;
  squirrel.body.rotation.set(climbPitch, squirrel.rotation, 0, 'YXZ');
  squirrel.body.position.y = animate && moving && climb === 0
    ? Math.abs(Math.sin(gait)) * 0.12 : 0;
  if (digging) squirrel.body.rotation.x = 0.18 + Math.sin(time * 30) * 0.15;
  squirrel.torso.position.set(0, mix(0.62, 0.48, q), mix(0, -0.06, q));
  squirrel.torso.scale.set(mix(0.36, 0.34, q), mix(0.49, 0.30, q), mix(0.32, 0.61, q));
  squirrel.belly.position.set(0, mix(0.59, 0.37, q), mix(0.25, 0.06, q));
  squirrel.belly.scale.set(0.23, mix(0.34, 0.13, q), mix(0.13, 0.46, q));
  squirrel.head.position.set(0, mix(1.15, 0.64, q), mix(0.11, 0.58, q));
  squirrel.head.rotation.x = -0.12 * q;
  squirrel.tail.position.set(0, -0.12 * q, -0.45 * q);
  squirrel.tail.rotation.x = -0.5 * q + (animate && moving ? Math.sin(stride / 2) * 0.1 : 0);
  squirrel.feet.forEach((foot, i) => {
    const stroke = Math.sin(stride + i * Math.PI);
    foot.position.set((i ? 1 : -1) * mix(0.22, 0.26, q),
      0.15 + (animate && moving ? Math.max(0, stroke) * 0.08 * q : 0),
      mix(0.16, -0.46, q) + (animate && moving ? mix(Math.sin(gait + i * Math.PI) * 0.18, stroke * 0.22, q) : 0));
    foot.rotation.x = animate && moving ? stroke * 0.35 * q : 0;
  });
  squirrel.arms.forEach((arm, i) => {
    // Opposite fore/hind paws alternate their reach while the other pair grips.
    const stroke = Math.sin(stride + i * Math.PI + Math.PI);
    arm.position.set((i ? 1 : -1) * mix(0.32, 0.27, q), mix(0.66, 0.29, q),
      mix(0.24, 0.48, q) + (animate && moving ? stroke * 0.16 * q : 0));
    arm.rotation.z = (i ? 1 : -1) * 0.35 * (1 - q);
    arm.rotation.x = digging ? -0.8 + Math.sin(time * 30 + i) * 0.4
      : mix(carrying ? -0.55 : moving && animate ? Math.sin(gait + i * Math.PI) * 0.35 : 0,
        animate && moving ? stroke * 0.55 : 0, q);
    const paw = squirrel.forepaws[i];
    paw.visible = q > 0.05;
    paw.position.set((i ? 1 : -1) * 0.27,
      0.13 + (animate && moving ? Math.max(0, stroke) * 0.08 : 0),
      0.55 + (animate && moving ? stroke * 0.22 : 0));
  });
  squirrel.held.visible = carrying && !digging;
  squirrel.held.position.set(0, mix(0.58, 0.54, q), mix(0.43, 0.93, q));
  squirrel.ring.visible = climb === 0;
  squirrel.marker.visible = climb === 0;
  squirrel.marker.position.y = 2.5;
}
