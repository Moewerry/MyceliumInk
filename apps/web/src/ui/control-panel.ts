import {
  VIRTUAL_CITIES,
  type WeatherService,
  type WeatherServiceState,
  COLONY_THEMES,
} from '@mycelium-ink/core';

export type TabId = 'weather' | 'audio' | 'colony' | 'time';

export interface ControlPanelCallbacks {
  onWeatherChange: (field: keyof WeatherServiceState['data'], value: number) => void;
  onRefreshWeather: () => void;
  onVirtualCity: (id: string) => void;
  onMicToggle: () => void;
  onColonyTheme: (index: number) => void;
  onColonyDensity: (value: number) => void;
  onColonyGrowth: (value: number) => void;
  onColonyRebirth: () => void;
  onErosionSpeed: (speed: number) => void;
  onWritePhrase: () => void;
}

export class ControlPanel {
  readonly element: HTMLElement;
  private activeTab: TabId = 'weather';
  private open = false;

  constructor(
    private weatherService: WeatherService,
    private callbacks: ControlPanelCallbacks,
  ) {
    this.element = document.createElement('aside');
    this.element.className = 'control-panel';
    this.element.innerHTML = this.template();
    this.bindEvents();
    weatherService.subscribe((s) => this.updateWeatherUI(s));
  }

  toggle(): void {
    this.open = !this.open;
    this.element.classList.toggle('open', this.open);
  }

  isOpen(): boolean {
    return this.open;
  }

  close(): void {
    this.open = false;
    this.element.classList.remove('open');
  }

  private template(): string {
    const cities = VIRTUAL_CITIES.map(
      (c) => `<button class="city-card" data-city="${c.id}">${c.name}</button>`,
    ).join('');

    const themes = COLONY_THEMES.map(
      (t, i) => `<button class="city-card" data-theme="${i}">${t.name}</button>`,
    ).join('');

    return `
      <div class="panel-header">
        <h2>控制</h2>
        <button type="button" class="panel-close" aria-label="关闭">×</button>
      </div>
      <nav class="panel-tabs">
        <button class="tab-btn active" data-tab="weather">天气</button>
        <button class="tab-btn" data-tab="audio">声音</button>
        <button class="tab-btn" data-tab="colony">菌落</button>
        <button class="tab-btn" data-tab="time">时间</button>
      </nav>
      <div class="panel-body">
        <div class="tab-panel active" data-panel="weather">
          <div class="weather-header">
            <span id="weather-city">北京</span>
            <span id="weather-badge" class="badge" hidden>手动</span>
          </div>
          <div class="weather-stats">
            <div class="stat-item"><div class="stat-value" id="stat-temp">20</div><div class="stat-label">温度 °C</div></div>
            <div class="stat-item"><div class="stat-value" id="stat-humidity">60</div><div class="stat-label">湿度 %</div></div>
            <div class="stat-item"><div class="stat-value" id="stat-wind">5</div><div class="stat-label">风速 m/s</div></div>
            <div class="stat-item"><div class="stat-value" id="stat-pressure">1013</div><div class="stat-label">气压 hPa</div></div>
          </div>
          ${this.slider('temp', '温度', -10, 40, 20)}
          ${this.slider('humidity', '湿度', 0, 100, 60)}
          ${this.slider('windSpeed', '风速', 0, 30, 5)}
          ${this.slider('pressure', '气压', 980, 1040, 1013)}
          <button class="btn-primary" id="btn-refresh-weather">刷新天气</button>
          <button class="btn-primary" id="btn-write">书写新句</button>
          <p style="font-size:11px;margin-top:12px;opacity:0.6">虚拟城市</p>
          <div class="city-grid">${cities}</div>
        </div>
        <div class="tab-panel" data-panel="audio">
          <div class="spectrum-ring" id="spectrum-ring">
            <div class="energy" id="spectrum-energy"></div>
            <span id="volume-text">0%</span>
          </div>
          <div class="freq-bars">
            <div class="freq-bar"><div class="fill" id="bar-bass"></div></div>
            <div class="freq-bar"><div class="fill" id="bar-mid"></div></div>
            <div class="freq-bar"><div class="fill" id="bar-treble"></div></div>
          </div>
          <p style="text-align:center;font-size:11px;opacity:0.5;margin-top:8px">低 · 中 · 高</p>
          <button class="btn-primary" id="btn-mic" style="margin-top:16px">开启麦克风</button>
        </div>
        <div class="tab-panel" data-panel="colony">
          <p style="font-size:12px;margin-bottom:8px">配色主题</p>
          <div class="city-grid">${themes}</div>
          ${this.slider('density', '粒子密度', 200, 1500, 1000, 'colony')}
          ${this.slider('growth', '生长速度', 0.5, 3, 1, 'colony', 0.1)}
          <button class="btn-primary" id="btn-rebirth">重生全部菌落</button>
        </div>
        <div class="tab-panel" data-panel="time">
          <p style="font-size:12px;margin-bottom:12px">作品年龄：<span id="work-age">0h 0m 0s</span></p>
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <button class="city-card erosion-speed" data-speed="1">1×</button>
            <button class="city-card erosion-speed" data-speed="10">10×</button>
            <button class="city-card erosion-speed" data-speed="100">100×</button>
          </div>
        </div>
      </div>
    `;
  }

  private slider(
    id: string,
    label: string,
    min: number,
    max: number,
    value: number,
    ns = 'weather',
    step = 1,
  ): string {
    return `
      <div class="slider-group" data-ns="${ns}">
        <label><span>${label}</span><span id="val-${id}">${value}</span></label>
        <input type="range" class="ink-slider" id="slider-${id}" data-field="${id}"
          min="${min}" max="${max}" step="${step}" value="${value}" />
      </div>
    `;
  }

  private bindEvents(): void {
    this.element.querySelector('.panel-close')?.addEventListener('click', () => this.close());

    this.element.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.tab as TabId;
        this.switchTab(tab);
      });
    });

    this.element.querySelectorAll('.ink-slider[data-field]').forEach((input) => {
      input.addEventListener('input', () => {
        const el = input as HTMLInputElement;
        const field = el.dataset.field!;
        const val = parseFloat(el.value);
        const valEl = this.element.querySelector(`#val-${field}`);
        if (valEl) valEl.textContent = String(Math.round(val * 10) / 10);

        if (el.closest('[data-ns="colony"]')) {
          if (field === 'density') this.callbacks.onColonyDensity(val);
          if (field === 'growth') this.callbacks.onColonyGrowth(val);
        } else {
          this.callbacks.onWeatherChange(
            field as keyof WeatherServiceState['data'],
            val,
          );
        }
      });
    });

    this.element.querySelector('#btn-refresh-weather')?.addEventListener('click', () => {
      this.callbacks.onRefreshWeather();
    });

    this.element.querySelector('#btn-write')?.addEventListener('click', () => {
      this.callbacks.onWritePhrase();
    });

    this.element.querySelector('#btn-mic')?.addEventListener('click', () => {
      this.callbacks.onMicToggle();
    });

    this.element.querySelector('#btn-rebirth')?.addEventListener('click', () => {
      this.callbacks.onColonyRebirth();
    });

    this.element.querySelectorAll('.city-card[data-city]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onVirtualCity((btn as HTMLElement).dataset.city!);
      });
    });

    this.element.querySelectorAll('.city-card[data-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onColonyTheme(parseInt((btn as HTMLElement).dataset.theme!, 10));
      });
    });

    this.element.querySelectorAll('.erosion-speed').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onErosionSpeed(parseFloat((btn as HTMLElement).dataset.speed!));
      });
    });
  }

  private switchTab(tab: TabId): void {
    this.activeTab = tab;
    this.element.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.tab === tab);
    });
    this.element.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('active', (p as HTMLElement).dataset.panel === tab);
    });
  }

  private updateWeatherUI(state: WeatherServiceState): void {
    const { data, mode, city } = state;
    const set = (id: string, val: string | number) => {
      const el = this.element.querySelector(`#${id}`);
      if (el) el.textContent = String(val);
    };
    set('weather-city', city);
    set('stat-temp', Math.round(data.temp));
    set('stat-humidity', Math.round(data.humidity));
    set('stat-wind', Math.round(data.windSpeed));
    set('stat-pressure', Math.round(data.pressure));

    const badge = this.element.querySelector('#weather-badge') as HTMLElement;
    if (mode === 'manual' || mode === 'offline') {
      badge.hidden = false;
      badge.textContent = mode === 'offline' ? '离线' : '手动';
    } else {
      badge.hidden = true;
    }

    const fields = ['temp', 'humidity', 'windSpeed', 'pressure'] as const;
    for (const f of fields) {
      const slider = this.element.querySelector(`#slider-${f}`) as HTMLInputElement | null;
      if (slider && document.activeElement !== slider) {
        slider.value = String(data[f]);
        set(`val-${f}`, Math.round(data[f]));
      }
    }
  }

  updateAudioUI(volume: number, bass: number, mid: number, treble: number): void {
    const ring = this.element.querySelector('#spectrum-energy') as HTMLElement;
    if (ring) ring.style.setProperty('--energy', String(volume));
    const volText = this.element.querySelector('#volume-text');
    if (volText) volText.textContent = `${Math.round(volume * 100)}%`;
    const setBar = (id: string, v: number) => {
      const bar = this.element.querySelector(`#${id}`) as HTMLElement;
      if (bar) bar.style.height = `${v * 100}%`;
    };
    setBar('bar-bass', bass);
    setBar('bar-mid', mid);
    setBar('bar-treble', treble);
  }

  setMicLabel(active: boolean): void {
    const btn = this.element.querySelector('#btn-mic');
    if (btn) btn.textContent = active ? '关闭麦克风' : '开启麦克风';
  }

  updateWorkAge(age: string): void {
    const el = this.element.querySelector('#work-age');
    if (el) el.textContent = age;
  }
}
