/** 简易 Simplex 风格 2D 噪声（原型用） */
export class SimplexNoise {
  private perm: Uint8Array;

  constructor(seed = 0) {
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed || 1;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const aa = this.perm[X] + Y;
    const ab = this.perm[X] + Y + 1;
    const ba = this.perm[X + 1] + Y;
    const bb = this.perm[X + 1] + Y + 1;
    const grad = (h: number, px: number, py: number) => {
      const g = h & 3;
      const u2 = g < 2 ? px : py;
      const v2 = g < 2 ? py : px;
      return ((g & 1) === 0 ? u2 : -u2) + ((g & 2) === 0 ? v2 : -v2);
    };
    const x1 = lerp(grad(this.perm[aa], xf, yf), grad(this.perm[ba], xf - 1, yf), u);
    const x2 = lerp(grad(this.perm[ab], xf, yf - 1), grad(this.perm[bb], xf - 1, yf - 1), u);
    return (lerp(x1, x2, v) + 1) * 0.5;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
