/** 天气原始数据 */
export interface WeatherData {
  temp: number;
  humidity: number;
  windSpeed: number;
  pressure: number;
  city?: string;
  timestamp?: number;
}

/** 书法笔刷参数（由天气映射得出） */
export interface BrushParams {
  inkDensity: number;
  bleedRadius: number;
  jitter: number;
  flyWhiteChance: number;
  strokeWeight: number;
}

/** 菌落粒子状态 */
export enum ColonyState {
  SEED = 0,
  GROWING = 1,
  MATURE = 2,
  DECAY = 3,
  DUST = 4,
}

/** 音频特征 */
export interface AudioFeatures {
  bass: number;
  mid: number;
  treble: number;
  volume: number;
  bpm?: number;
}

/** 渲染层配置 */
export interface RenderConfig {
  width: number;
  height: number;
  particleLimit: number;
  lodLevel: number;
}

/** 虚拟城市预设 */
export interface VirtualCity {
  id: string;
  name: string;
  weather: WeatherData;
}
