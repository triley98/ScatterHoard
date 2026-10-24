import { CanvasTexture, SRGBColorSpace } from 'three';

/** Fixed forest-floor detail, independent of digging, stashes, and match RNG. */
export function makeTurfTexture() {
  let seed = 90317;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#718451';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft, irregular moss and dry-grass variations rather than tiles or cell marks.
  const moss = ['#536e40', '#8c995f', '#617d49', '#8b8c54'];
  for (let i = 0; i < 150; i++) {
    const radius = 12 + random() * 52;
    ctx.save();
    ctx.translate(random() * canvas.width, random() * canvas.height);
    ctx.scale(0.7 + random() * 0.9, 0.45 + random() * 0.6);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, moss[i % moss.length]);
    gradient.addColorStop(1, `${moss[i % moss.length]}00`);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = gradient;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
  }

  // Fine organic grain stays visible between the larger leaves and grass clumps.
  const grain = ['#354e30', '#c7bf82', '#9caa69', '#5b603c'];
  for (let i = 0; i < 12000; i++) {
    ctx.globalAlpha = 0.12 + random() * 0.18;
    ctx.fillStyle = grain[i % grain.length];
    ctx.fillRect(random() * canvas.width, random() * canvas.height,
      0.5 + random() * 1.6, 0.4 + random() * 1.1);
  }
  for (let i = 0; i < 2000; i++) {
    const x = random() * canvas.width, y = random() * canvas.height;
    const length = 2 + random() * 5;
    const angle = random() * Math.PI * 2;
    ctx.globalAlpha = 0.16 + random() * 0.2;
    ctx.strokeStyle = grain[i % grain.length];
    ctx.lineWidth = 0.5 + random() * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(angle) * length * 0.5,
      y + Math.sin(angle) * length * 0.2,
      x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new CanvasTexture(canvas);
  texture.name = 'moss-and-grass-floor';
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
