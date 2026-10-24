export const ROUND_TIMING = Object.freeze({
  returning: 3,
  fadeOut: 3,
  fadeIn: 3,
  countdown: 3,
});

export function transitionDuration(final = false) {
  return ROUND_TIMING.returning + ROUND_TIMING.fadeOut + ROUND_TIMING.fadeIn +
    (final ? 0 : ROUND_TIMING.countdown);
}

/** Both clients derive the entire break from the authoritative, pausable clock. */
export function roundTransition(remaining, final = false) {
  const elapsed = Math.max(0, transitionDuration(final) - remaining);
  const fadeStart = ROUND_TIMING.returning;
  const dawnStart = fadeStart + ROUND_TIMING.fadeOut;
  const countdownStart = dawnStart + ROUND_TIMING.fadeIn;
  if (elapsed < fadeStart)
    return { stage: 'returning', progress: elapsed / fadeStart, opacity: 0, daylight: false };
  if (elapsed < dawnStart) {
    const progress = (elapsed - fadeStart) / ROUND_TIMING.fadeOut;
    return { stage: 'fade-out', progress, opacity: progress, daylight: false };
  }
  if (elapsed < countdownStart) {
    const progress = (elapsed - dawnStart) / ROUND_TIMING.fadeIn;
    return { stage: 'fade-in', progress, opacity: 1 - progress, daylight: true };
  }
  return { stage: final ? 'complete' : 'countdown',
    progress: Math.min(1, (elapsed - countdownStart) / ROUND_TIMING.countdown),
    opacity: 0, daylight: true };
}

/** Shortest visible route around the board's expanded obstacle rectangles. */
export function returnPath(start, target, obstacles, radius = 0.4) {
  const boxes = obstacles.map(({ x, z, width, depth }) => ({
    left: x - radius, right: x + width + radius,
    back: z - radius, front: z + depth + radius,
  }));
  const prefix = [];
  // A legal player can stop within the extra clearance margin. Step outward
  // before routing, rather than treating that margin as an enclosed obstacle.
  for (const box of boxes) {
    if (start.x <= box.left || start.x >= box.right || start.z <= box.back || start.z >= box.front) continue;
    prefix.push(start);
    start = [
      { x: box.left, z: start.z }, { x: box.right, z: start.z },
      { x: start.x, z: box.back }, { x: start.x, z: box.front },
    ].sort((a, b) => Math.hypot(a.x - start.x, a.z - start.z) -
      Math.hypot(b.x - start.x, b.z - start.z))[0];
  }
  const clear = (a, b) => boxes.every(box => {
    let enter = 0, exit = 1;
    for (const [axis, min, max] of [
      ['x', box.left, box.right], ['z', box.back, box.front],
    ]) {
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < 1e-8) {
        if (a[axis] <= min || a[axis] >= max) return true;
      } else {
        const first = (min - a[axis]) / delta, last = (max - a[axis]) / delta;
        enter = Math.max(enter, Math.min(first, last));
        exit = Math.min(exit, Math.max(first, last));
      }
      if (enter >= exit) return true;
    }
    return false;
  });
  const nodes = [start, target, ...boxes.flatMap(box => [
    { x: box.left, z: box.back }, { x: box.right, z: box.back },
    { x: box.left, z: box.front }, { x: box.right, z: box.front },
  ])];
  const distance = nodes.map(() => Infinity), previous = [], visited = new Set();
  distance[0] = 0;
  while (visited.size < nodes.length) {
    let nearest = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!visited.has(i) && (nearest < 0 || distance[i] < distance[nearest])) nearest = i;
    if (nearest < 0 || !Number.isFinite(distance[nearest])) break;
    if (nearest === 1) {
      const path = [];
      for (let i = 1; i !== undefined; i = previous[i]) path.unshift(nodes[i]);
      return [...prefix, ...path];
    }
    visited.add(nearest);
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i) || !clear(nodes[nearest], nodes[i])) continue;
      const next = distance[nearest] + Math.hypot(
        nodes[i].x - nodes[nearest].x, nodes[i].z - nodes[nearest].z);
      if (next < distance[i]) { distance[i] = next; previous[i] = nearest; }
    }
  }
  return [...prefix, start, target];
}

export function pointOnPath(path, progress) {
  const lengths = path.slice(1).map((point, i) =>
    Math.hypot(point.x - path[i].x, point.z - path[i].z));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * Math.min(1, Math.max(0, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? remaining / lengths[i] : 1;
      const a = path[i], b = path[i + 1];
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
        facing: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    remaining -= lengths[i];
  }
  return { ...path[0], facing: 0 };
}
