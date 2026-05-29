/** 氧化与时间侵蚀引擎（M1 基础版） */
export class ErosionTimeline {
  private age = 0;
  private speed = 1;
  private paused = false;
  private hueShift = 0;

  setSpeed(multiplier: number): void {
    this.speed = multiplier;
  }

  togglePause(): boolean {
    this.paused = !this.paused;
    return this.paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  update(dt: number): void {
    if (this.paused) return;
    this.age += dt * this.speed;
    this.hueShift = (Math.sin(this.age / 1800) * 0.5 + 0.5) * 15;
  }

  getAge(): number {
    return this.age;
  }

  getAgeFormatted(): string {
    const s = Math.floor(this.age);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
  }

  /** 氧化色相偏移（每 30 分钟缓慢变化） */
  getOxidationHueShift(): number {
    return this.hueShift;
  }

  getOpacityFactor(): number {
    return 1 - Math.min(0.15, this.age / 86400);
  }
}
