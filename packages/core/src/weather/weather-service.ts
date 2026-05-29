import type { VirtualCity, WeatherData } from '../types.js';

const CACHE_KEY = 'mycelium-ink-weather';
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

export type WeatherMode = 'live' | 'manual' | 'offline' | 'virtual';

export interface WeatherServiceState {
  data: WeatherData;
  mode: WeatherMode;
  city: string;
  error?: string;
}

/** 12 个虚拟城市预设 */
export const VIRTUAL_CITIES: VirtualCity[] = [
  { id: 'kyoto', name: '京都', weather: { temp: 18, humidity: 72, windSpeed: 3, pressure: 1015 } },
  { id: 'reykjavik', name: '雷克雅未克', weather: { temp: 4, humidity: 85, windSpeed: 18, pressure: 1002 } },
  { id: 'marrakech', name: '马拉喀什', weather: { temp: 32, humidity: 25, windSpeed: 8, pressure: 1018 } },
  { id: 'singapore', name: '新加坡', weather: { temp: 30, humidity: 88, windSpeed: 5, pressure: 1009 } },
  { id: 'london', name: '伦敦', weather: { temp: 12, humidity: 78, windSpeed: 12, pressure: 1005 } },
  { id: 'cairo', name: '开罗', weather: { temp: 28, humidity: 35, windSpeed: 6, pressure: 1012 } },
  { id: 'oslo', name: '奥斯陆', weather: { temp: 2, humidity: 70, windSpeed: 10, pressure: 1010 } },
  { id: 'mumbai', name: '孟买', weather: { temp: 31, humidity: 82, windSpeed: 7, pressure: 1008 } },
  { id: 'sydney', name: '悉尼', weather: { temp: 22, humidity: 65, windSpeed: 9, pressure: 1016 } },
  { id: 'ulaanbaatar', name: '乌兰巴托', weather: { temp: -8, humidity: 45, windSpeed: 14, pressure: 1025 } },
  { id: 'lima', name: '利马', weather: { temp: 19, humidity: 90, windSpeed: 4, pressure: 1014 } },
  { id: 'nairobi', name: '内罗毕', weather: { temp: 24, humidity: 55, windSpeed: 6, pressure: 1013 } },
];

const DEFAULT_WEATHER: WeatherData = {
  temp: 20,
  humidity: 60,
  windSpeed: 5,
  pressure: 1013,
  city: '北京',
  timestamp: Date.now(),
};

export class WeatherService {
  private state: WeatherServiceState = {
    data: { ...DEFAULT_WEATHER },
    mode: 'manual',
    city: DEFAULT_WEATHER.city ?? '北京',
  };

  private listeners = new Set<(s: WeatherServiceState) => void>();
  private retryCount = 0;

  getState(): WeatherServiceState {
    return { ...this.state, data: { ...this.state.data } };
  }

  subscribe(fn: (s: WeatherServiceState) => void): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    const s = this.getState();
    for (const fn of this.listeners) fn(s);
  }

  setManual(data: Partial<WeatherData>): void {
    this.state = {
      ...this.state,
      mode: 'manual',
      data: { ...this.state.data, ...data, timestamp: Date.now() },
    };
    this.cache();
    this.notify();
  }

  setVirtualCity(city: VirtualCity): void {
    this.state = {
      data: { ...city.weather, city: city.name, timestamp: Date.now() },
      mode: 'virtual',
      city: city.name,
    };
    this.cache();
    this.notify();
  }

  async fetchByCoords(lat: number, lon: number, cityName = '当前位置'): Promise<void> {
    try {
      const url = new URL(OPEN_METEO);
      url.searchParams.set('latitude', String(lat));
      url.searchParams.set('longitude', String(lon));
      url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure');

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        current: {
          temperature_2m: number;
          relative_humidity_2m: number;
          wind_speed_10m: number;
          surface_pressure: number;
        };
      };
      const c = json.current;
      this.state = {
        data: {
          temp: c.temperature_2m,
          humidity: c.relative_humidity_2m,
          windSpeed: c.wind_speed_10m,
          pressure: c.surface_pressure,
          city: cityName,
          timestamp: Date.now(),
        },
        mode: 'live',
        city: cityName,
        error: undefined,
      };
      this.retryCount = 0;
      this.cache();
      this.notify();
    } catch (e) {
      this.retryCount++;
      const cached = this.loadCache();
      if (cached) {
        this.state = { data: cached, mode: 'offline', city: cached.city ?? cityName, error: String(e) };
      } else {
        this.state = { ...this.state, mode: 'offline', error: String(e) };
      }
      this.notify();
      if (this.retryCount < 3) {
        const delay = Math.pow(2, this.retryCount) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        return this.fetchByCoords(lat, lon, cityName);
      }
    }
  }

  async fetchByCity(cityName: string): Promise<void> {
    const coords: Record<string, [number, number]> = {
      北京: [39.9, 116.4],
      上海: [31.2, 121.5],
      东京: [35.7, 139.7],
      纽约: [40.7, -74.0],
      巴黎: [48.9, 2.3],
    };
    const [lat, lon] = coords[cityName] ?? [39.9, 116.4];
    return this.fetchByCoords(lat, lon, cityName);
  }

  private cache(): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(this.state.data));
    } catch {
      /* ignore */
    }
  }

  private loadCache(): WeatherData | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as WeatherData) : null;
    } catch {
      return null;
    }
  }

  loadFromCacheOnStart(): void {
    const cached = this.loadCache();
    if (cached) {
      this.state = { data: cached, mode: 'offline', city: cached.city ?? '缓存' };
      this.notify();
    }
  }
}
