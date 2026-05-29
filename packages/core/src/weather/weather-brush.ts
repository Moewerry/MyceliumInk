import type { BrushParams, WeatherData } from '../types.js';
import { clamp, lerp, mapRange } from '../utils/math.js';

/** 将气象数据映射为书法笔刷参数（PRD 6.1 简化版） */
export function mapWeatherToBrush(weather: WeatherData): BrushParams {
  const { temp, humidity, windSpeed, pressure } = weather;

  return {
    inkDensity: mapRange(humidity, 0, 100, 0.3, 1.0),
    bleedRadius: mapRange(humidity, 0, 100, 2, 18),
    jitter: mapRange(windSpeed, 0, 30, 0, 8),
    flyWhiteChance: mapRange(windSpeed, 0, 30, 0.02, 0.35),
    strokeWeight: mapRange(temp, -10, 40, 1.5, 6) * mapRange(pressure, 980, 1040, 0.85, 1.15),
  };
}

/** 平滑过渡笔刷参数 */
export class BrushParamsInterpolator {
  private current: BrushParams;
  private target: BrushParams;
  private progress = 1;

  constructor(initial: BrushParams) {
    this.current = { ...initial };
    this.target = { ...initial };
  }

  setTarget(params: BrushParams, durationMs = 800): void {
    this.target = { ...params };
    this.progress = 0;
    this._durationMs = durationMs;
  }

  private _durationMs = 800;
  private _lastTime = 0;

  update(now: number): BrushParams {
    if (this._lastTime === 0) this._lastTime = now;
    const dt = now - this._lastTime;
    this._lastTime = now;

    if (this.progress < 1) {
      this.progress = clamp(this.progress + dt / this._durationMs, 0, 1);
      const t = this.progress;
      this.current = {
        inkDensity: lerp(this.current.inkDensity, this.target.inkDensity, t),
        bleedRadius: lerp(this.current.bleedRadius, this.target.bleedRadius, t),
        jitter: lerp(this.current.jitter, this.target.jitter, t),
        flyWhiteChance: lerp(this.current.flyWhiteChance, this.target.flyWhiteChance, t),
        strokeWeight: lerp(this.current.strokeWeight, this.target.strokeWeight, t),
      };
    }
    return this.get();
  }

  get(): BrushParams {
    return { ...this.current };
  }
}
