import type { BrushParams } from '../types.js';
import { SimplexNoise } from '../utils/noise.js';
import wordBank from './word-bank.json' with { type: 'json' };

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export interface BrushStroke {
  points: StrokePoint[];
  char: string;
}

/** 书法生成引擎（Canvas 2D 驱动方在 web 层） */
export class BrushEngine {
  private noise = new SimplexNoise(42);
  private phraseIndex = 0;

  pickPhrase(): string {
    const phrases = wordBank.phrases;
    const phrase = phrases[this.phraseIndex % phrases.length];
    this.phraseIndex++;
    return phrase;
  }

  pickChar(): string {
    const chars = wordBank.chars;
    return chars[Math.floor(Math.random() * chars.length)];
  }

  /** 生成单字笔画路径（竖排，贝塞尔模拟运笔） */
  generateCharStroke(
    char: string,
    cx: number,
    cy: number,
    size: number,
    params: BrushParams,
  ): BrushStroke {
    const points: StrokePoint[] = [];
    const segments = 24 + Math.floor(params.strokeWeight * 4);
    const jitter = params.jitter;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.15;
      const r = size * (0.3 + t * 0.7);
      const nx = this.noise.noise2D(cx * 0.01 + t * 2, cy * 0.01) - 0.5;
      const ny = this.noise.noise2D(cx * 0.01, cy * 0.01 + t * 2) - 0.5;
      const speed = Math.abs(Math.sin(t * Math.PI));
      const pressure = params.inkDensity * (0.4 + speed * 0.6) * params.strokeWeight * 0.2;

      points.push({
        x: cx + Math.cos(angle) * r * t + nx * jitter,
        y: cy + Math.sin(angle) * r * t + ny * jitter,
        pressure: Math.max(0.1, pressure),
      });
    }

    return { points, char };
  }

  /** 在 Canvas 2D 上绘制笔画 */
  drawStroke(
    ctx: CanvasRenderingContext2D,
    stroke: BrushStroke,
    params: BrushParams,
  ): void {
    const { points } = stroke;
    if (points.length < 2) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(15, 15, 15, ${params.inkDensity * 0.85})`;

    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const w = (p0.pressure + p1.pressure) * 2;

      if (Math.random() < params.flyWhiteChance) {
        ctx.globalAlpha = 0.15;
      } else {
        ctx.globalAlpha = params.inkDensity;
      }

      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;
      ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
      ctx.stroke();

      if (params.bleedRadius > 0 && i % 3 === 0) {
        const g = ctx.createRadialGradient(p1.x, p1.y, 0, p1.x, p1.y, params.bleedRadius);
        g.addColorStop(0, `rgba(15, 15, 15, ${params.inkDensity * 0.08})`);
        g.addColorStop(1, 'rgba(15, 15, 15, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, params.bleedRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.font = `${params.strokeWeight * 18}px "Noto Serif SC", serif`;
    ctx.fillStyle = `rgba(15, 15, 15, ${params.inkDensity})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const last = points[points.length - 1];
    ctx.fillText(stroke.char, last.x, last.y);

    ctx.restore();
  }

  /** 绘制宣纸纹理 */
  drawPaperTexture(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const n = this.noise.noise2D(x * 0.008, y * 0.008);
        const v = 248 + Math.floor(n * 8);
        const i = (y * w + x) * 4;
        data[i] = v;
        data[i + 1] = v - 7;
        data[i + 2] = v - 15;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }
}
