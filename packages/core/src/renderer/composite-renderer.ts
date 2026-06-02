import type { ColonySystem } from '../colony/colony-system.js';
import type { BrushEngine, BrushStroke } from '../brush/brush-engine.js';
import type { BrushParams } from '../types.js';

/** 一句书法 = 一层沉积（保留落笔时的笔刷参数） */
export interface PhraseLayer {
  strokes: BrushStroke[];
  params: BrushParams;
  inkPoints: { x: number; y: number }[];
}

const MAX_PHRASE_LAYERS = 12;

/** 双层合成渲染器（Canvas 2D 书法 + WebGL/Canvas2D 菌落） */
export class CompositeRenderer {
  private brushCanvas: HTMLCanvasElement;
  private colonyCanvas: HTMLCanvasElement;
  private brushCtx: CanvasRenderingContext2D;
  private colonyCtx: CanvasRenderingContext2D;
  private phraseLayers: PhraseLayer[] = [];
  private width = 0;
  private height = 0;
  private webglSupported = false;
  private gl: WebGL2RenderingContext | null = null;

  constructor(container: HTMLElement) {
    this.brushCanvas = document.createElement('canvas');
    this.colonyCanvas = document.createElement('canvas');
    this.brushCanvas.className = 'layer-brush';
    this.colonyCanvas.className = 'layer-colony';
    this.colonyCanvas.style.mixBlendMode = 'normal';

    const brushCtx = this.brushCanvas.getContext('2d');
    const colonyCtx = this.colonyCanvas.getContext('2d');
    if (!brushCtx || !colonyCtx) throw new Error('Canvas 2D not supported');
    this.brushCtx = brushCtx;
    this.colonyCtx = colonyCtx;

    container.appendChild(this.brushCanvas);
    container.appendChild(this.colonyCanvas);

    this.initWebGL();
  }

  private initWebGL(): void {
    const glCanvas = document.createElement('canvas');
    const gl = glCanvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
    if (gl) {
      this.webglSupported = true;
      this.gl = gl;
    }
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    for (const c of [this.brushCanvas, this.colonyCanvas]) {
      c.width = width;
      c.height = height;
      c.style.width = `${width}px`;
      c.style.height = `${height}px`;
    }
  }

  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  isWebGLSupported(): boolean {
    return this.webglSupported;
  }

  clearBrushLayer(_brushEngine: BrushEngine): void {
    if (this.width < 1 || this.height < 1) return;
    this.brushCtx.clearRect(0, 0, this.width, this.height);
    this.brushCtx.fillStyle = 'rgba(243, 235, 224, 0.42)';
    this.brushCtx.fillRect(0, 0, this.width, this.height);
  }

  /** 添加一整句（层积），超出上限时移除最早的一句并重绘 */
  addPhraseLayer(
    strokes: BrushStroke[],
    params: BrushParams,
    inkPoints: { x: number; y: number }[],
    brushEngine: BrushEngine,
  ): void {
    if (this.width < 1 || this.height < 1 || strokes.length === 0) return;

    this.phraseLayers.push({
      strokes,
      params: { ...params },
      inkPoints: [...inkPoints],
    });

    if (this.phraseLayers.length > MAX_PHRASE_LAYERS) {
      this.phraseLayers.shift();
    }

    this.redrawPhraseLayers(brushEngine);
  }

  getPhraseLayerCount(): number {
    return this.phraseLayers.length;
  }

  getAllInkPoints(): { x: number; y: number }[] {
    return this.phraseLayers.flatMap((p) => p.inkPoints);
  }

  /** 清空所有书法层积 */
  clearPhraseLayers(brushEngine: BrushEngine): void {
    this.phraseLayers = [];
    this.clearBrushLayer(brushEngine);
  }

  redrawPhraseLayers(brushEngine: BrushEngine): void {
    if (this.width < 1 || this.height < 1) return;
    this.clearBrushLayer(brushEngine);
    for (const layer of this.phraseLayers) {
      for (const s of layer.strokes) {
        brushEngine.drawStroke(this.brushCtx, s, layer.params);
      }
    }
  }

  /** @deprecated 使用 addPhraseLayer */
  addStroke(stroke: BrushStroke, brushEngine: BrushEngine, params: BrushParams): void {
    this.addPhraseLayer([stroke], params, [], brushEngine);
  }

  redrawAllStrokes(brushEngine: BrushEngine, _params: BrushParams): void {
    this.redrawPhraseLayers(brushEngine);
  }

  renderColony(colony: ColonySystem): void {
    this.colonyCtx.clearRect(0, 0, this.width, this.height);

    if (this.webglSupported && this.gl) {
      this.renderColonyWebGL(colony);
      return;
    }

    for (let i = 0; i < colony.count; i++) {
      if (colony.state[i] === 4) continue;
      const [r, g, b, a] = colony.getColor(i);
      if (a <= 0) continue;
      const size = 3 + colony.life[i] * 6;
      this.colonyCtx.beginPath();
      this.colonyCtx.fillStyle = `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`;
      this.colonyCtx.arc(colony.x[i], colony.y[i], size, 0, Math.PI * 2);
      this.colonyCtx.fill();
    }
  }

  private renderColonyWebGL(colony: ColonySystem): void {
    for (let i = 0; i < colony.count; i++) {
      if (colony.state[i] === 4) continue;
      const [r, g, b, a] = colony.getColor(i);
      if (a <= 0) continue;
      const size = 3 + colony.life[i] * 5;
      this.colonyCtx.beginPath();
      this.colonyCtx.fillStyle = `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`;
      this.colonyCtx.arc(colony.x[i], colony.y[i], size, 0, Math.PI * 2);
      this.colonyCtx.fill();
    }
  }

  exportPNG(): string {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = this.width;
    exportCanvas.height = this.height;
    const ctx = exportCanvas.getContext('2d')!;
    ctx.drawImage(this.brushCanvas, 0, 0);
    ctx.drawImage(this.colonyCanvas, 0, 0);
    return exportCanvas.toDataURL('image/png');
  }
}
