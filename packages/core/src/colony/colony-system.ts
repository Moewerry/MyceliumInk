import type { AudioFeatures } from '../types.js';
import { ColonyState } from '../types.js';
import { clamp } from '../utils/math.js';

const MAX_PARTICLES = 2000;

export interface ColonyTheme {
  name: string;
  seed: [number, number, number];
  growing: [number, number, number];
  mature: [number, number, number];
}

export const COLONY_THEMES: ColonyTheme[] = [
  { name: '墨绿', seed: [0.2, 0.35, 0.25], growing: [0.15, 0.5, 0.35], mature: [0.1, 0.25, 0.2] },
  { name: '赭石', seed: [0.45, 0.3, 0.2], growing: [0.55, 0.4, 0.25], mature: [0.35, 0.25, 0.15] },
  { name: '青蓝', seed: [0.15, 0.3, 0.45], growing: [0.2, 0.45, 0.55], mature: [0.12, 0.28, 0.38] },
];

/** 菌落 Agent 系统（TypedArray + 对象池） */
export class ColonySystem {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Float32Array;
  readonly state: Uint8Array;
  readonly age: Float32Array;

  private activeCount = 0;
  private theme: ColonyTheme = COLONY_THEMES[0];
  private growthRate = 1;
  private inkAttractors: { x: number; y: number; strength: number }[] = [];

  constructor(maxParticles = 1000) {
    this.count = Math.min(maxParticles, MAX_PARTICLES);
    this.x = new Float32Array(this.count);
    this.y = new Float32Array(this.count);
    this.vx = new Float32Array(this.count);
    this.vy = new Float32Array(this.count);
    this.life = new Float32Array(this.count);
    this.state = new Uint8Array(this.count);
    this.age = new Float32Array(this.count);
    this.seedParticles(Math.min(80, this.count));
  }

  setTheme(index: number): void {
    this.theme = COLONY_THEMES[index % COLONY_THEMES.length];
  }

  setGrowthRate(rate: number): void {
    this.growthRate = clamp(rate, 0.5, 3);
  }

  setInkAttractors(points: { x: number; y: number }[]): void {
    this.inkAttractors = points.map((p) => ({ ...p, strength: 1 }));
  }

  rebirth(width: number, height: number): void {
    this.state.fill(ColonyState.DUST);
    this.activeCount = 0;
    this.seedParticles(Math.min(120, this.count), width, height);
  }

  private seedParticles(n: number, width = 800, height = 600): void {
    for (let i = 0; i < n && this.activeCount < this.count; i++) {
      const idx = this.findFreeSlot();
      if (idx < 0) break;
      this.x[idx] = Math.random() * width;
      this.y[idx] = Math.random() * height;
      this.vx[idx] = 0;
      this.vy[idx] = 0;
      this.life[idx] = 0.3 + Math.random() * 0.5;
      this.state[idx] = ColonyState.SEED;
      this.age[idx] = 0;
      this.activeCount++;
    }
  }

  private findFreeSlot(): number {
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] === ColonyState.DUST) return i;
    }
    if (this.activeCount < this.count) return this.activeCount;
    return -1;
  }

  update(dt: number, audio: AudioFeatures, width: number, height: number): void {
    const energy = audio.bass * 0.5 + audio.mid * 0.3 + audio.treble * 0.2;
    // 无音频时保留微弱呼吸式基线活动（约 15% 能量），避免完全休眠
    const ambient = 0.15;
    const effectiveEnergy = Math.max(energy, ambient * (1 - audio.volume));
    const spawnChance =
      effectiveEnergy * Math.max(audio.volume, ambient) * 0.08 * this.growthRate;

    if (Math.random() < spawnChance && this.activeCount < this.count * 0.9) {
      this.seedParticles(1, width, height);
    }

    for (let i = 0; i < this.count; i++) {
      const s = this.state[i];
      if (s === ColonyState.DUST) continue;

      this.age[i] += dt;
      let ax = 0;
      let ay = 0;

      for (const ink of this.inkAttractors) {
        const dx = ink.x - this.x[i];
        const dy = ink.y - this.y[i];
        const dist = Math.sqrt(dx * dx + dy * dy) + 1;
        if (dist < 200) {
          ax += (dx / dist) * ink.strength * 0.3;
          ay += (dy / dist) * ink.strength * 0.3;
        }
      }

      ax += (Math.random() - 0.5) * effectiveEnergy * 2;
      ay += (Math.random() - 0.5) * effectiveEnergy * 2 - 0.05 * effectiveEnergy;

      this.vx[i] = (this.vx[i] + ax * dt) * 0.98;
      this.vy[i] = (this.vy[i] + ay * dt) * 0.98;
      this.x[i] += this.vx[i] * dt * 60;
      this.y[i] += this.vy[i] * dt * 60;

      if (this.x[i] < 0 || this.x[i] > width) this.vx[i] *= -0.5;
      if (this.y[i] < 0 || this.y[i] > height) this.vy[i] *= -0.5;
      this.x[i] = clamp(this.x[i], 0, width);
      this.y[i] = clamp(this.y[i], 0, height);

      this.transitionFSM(i, dt, effectiveEnergy);
    }
  }

  private transitionFSM(i: number, dt: number, energy: number): void {
    const s = this.state[i];
    switch (s) {
      case ColonyState.SEED:
        if (this.age[i] > 0.5) this.state[i] = ColonyState.GROWING;
        break;
      case ColonyState.GROWING:
        this.life[i] = Math.min(1, this.life[i] + dt * 0.3 * this.growthRate * (1 + energy));
        if (this.life[i] >= 0.8) this.state[i] = ColonyState.MATURE;
        if (Math.random() < 0.001 * this.growthRate) this.spawnChild(i);
        break;
      case ColonyState.MATURE:
        if (this.age[i] > 8 + Math.random() * 5) this.state[i] = ColonyState.DECAY;
        break;
      case ColonyState.DECAY:
        this.life[i] -= dt * 0.15;
        if (this.life[i] <= 0) {
          this.state[i] = ColonyState.DUST;
          this.activeCount = Math.max(0, this.activeCount - 1);
        }
        break;
    }
  }

  private spawnChild(parent: number): void {
    const idx = this.findFreeSlot();
    if (idx < 0) return;
    this.x[idx] = this.x[parent] + (Math.random() - 0.5) * 20;
    this.y[idx] = this.y[parent] + (Math.random() - 0.5) * 20;
    this.state[idx] = ColonyState.SEED;
    this.life[idx] = 0.2;
    this.age[idx] = 0;
    this.activeCount++;
  }

  getColor(i: number): [number, number, number, number] {
    const s = this.state[i];
    const t = this.theme;
    let rgb: [number, number, number];
    if (s === ColonyState.SEED) rgb = t.seed;
    else if (s === ColonyState.GROWING) rgb = t.growing;
    else if (s === ColonyState.MATURE) rgb = t.mature;
    else rgb = [0.3, 0.25, 0.2];
    const alpha = s === ColonyState.DUST ? 0 : clamp(this.life[i] * 0.85 + 0.15, 0.15, 1);
    return [rgb[0], rgb[1], rgb[2], alpha];
  }

  get themeName(): string {
    return this.theme.name;
  }
}
