import {
  AudioAnalyzer,
  BrushEngine,
  BrushParamsInterpolator,
  ColonySystem,
  CompositeRenderer,
  ErosionTimeline,
  mapWeatherToBrush,
  MicrophoneAudioSource,
  VIRTUAL_CITIES,
  WeatherService,
} from '@mycelium-ink/core';
import { ControlPanel } from './ui/control-panel.js';

export class MyceliumApp {
  private weatherService = new WeatherService();
  private brushEngine = new BrushEngine();
  private brushInterpolator = new BrushParamsInterpolator(mapWeatherToBrush({ temp: 20, humidity: 60, windSpeed: 5, pressure: 1013 }));
  private colony = new ColonySystem(1000);
  private audioSource = new MicrophoneAudioSource();
  private audioAnalyzer = new AudioAnalyzer();
  private timeline = new ErosionTimeline();
  private renderer!: CompositeRenderer;
  private panel!: ControlPanel;
  private micActive = false;
  private lastTime = 0;
  private rafId = 0;

  private canvasWrapper!: HTMLElement;
  private silentHint!: HTMLElement;

  mount(root: HTMLElement): void {
    root.innerHTML = `
      <div class="app-layout">
        <nav class="edge-bar">
          <button class="edge-btn active" data-panel="weather" title="天气">☁</button>
          <button class="edge-btn" data-panel="audio" title="声音">♪</button>
          <button class="edge-btn" data-panel="colony" title="菌落">✿</button>
          <button class="edge-btn" data-panel="time" title="时间">◷</button>
        </nav>
        <main class="canvas-area">
          <div class="top-bar">
            <div class="logo">Mycelium Ink</div>
            <div class="top-actions">
              <button id="btn-fullscreen">全屏</button>
              <button id="btn-export">导出 PNG</button>
            </div>
          </div>
          <div class="canvas-wrapper" id="canvas-wrapper"></div>
          <p class="silent-hint" id="silent-hint">静默中，菌落进入休眠…</p>
          <div class="status-bar" id="status-bar"></div>
        </main>
      </div>
    `;

    this.canvasWrapper = root.querySelector('#canvas-wrapper')!;
    this.silentHint = root.querySelector('#silent-hint')!;
    this.renderer = new CompositeRenderer(this.canvasWrapper);

    this.panel = new ControlPanel(this.weatherService, {
      onWeatherChange: (field, value) => {
        if (field === 'city' || field === 'timestamp') return;
        const s = this.weatherService.getState().data;
        this.weatherService.setManual({ ...s, [field]: value });
        this.onWeatherUpdate();
      },
      onRefreshWeather: () => this.weatherService.fetchByCity('北京'),
      onVirtualCity: (id) => {
        const city = VIRTUAL_CITIES.find((c) => c.id === id);
        if (city) {
          this.weatherService.setVirtualCity(city);
          this.onWeatherUpdate();
        }
      },
      onMicToggle: () => this.toggleMic(),
      onColonyTheme: (i) => this.colony.setTheme(i),
      onColonyDensity: () => {},
      onColonyGrowth: (v) => this.colony.setGrowthRate(v),
      onColonyRebirth: () => {
        const { width, height } = this.renderer.getDimensions();
        this.colony.rebirth(width, height);
      },
      onErosionSpeed: (s) => this.timeline.setSpeed(s),
      onWritePhrase: () => this.writeNextPhrase(),
    });

    document.body.appendChild(this.panel.element);
    this.bindUI(root);
    this.weatherService.loadFromCacheOnStart();
    this.onWeatherUpdate();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.renderer.clearBrushLayer(this.brushEngine);
    this.writeNextPhrase();
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  private bindUI(root: HTMLElement): void {
    root.querySelectorAll('.edge-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.panel.toggle();
        root.querySelectorAll('.edge-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    root.querySelector('#btn-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        document.body.classList.add('fullscreen');
      } else {
        document.exitFullscreen();
        document.body.classList.remove('fullscreen');
      }
    });

    root.querySelector('#btn-export')?.addEventListener('click', () => {
      const dataUrl = this.renderer.exportPNG();
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `mycelium-ink-${Date.now()}.png`;
      a.click();
    });

    this.canvasWrapper.addEventListener('click', (e) => {
      if (this.panel.isOpen() && !(e.target as HTMLElement).closest('.control-panel')) {
        this.panel.close();
      }
    });

    this.canvasWrapper.addEventListener('dblclick', () => {
      this.timeline.togglePause();
    });
  }

  private onWeatherUpdate(): void {
    const { data } = this.weatherService.getState();
    const target = mapWeatherToBrush(data);
    this.brushInterpolator.setTarget(target, 800);
    this.renderer.redrawAllStrokes(this.brushEngine, this.brushInterpolator.get());
  }

  private async toggleMic(): Promise<void> {
    if (this.micActive) {
      this.audioSource.stop();
      this.micActive = false;
    } else {
      try {
        await this.audioSource.start();
        this.micActive = true;
      } catch {
        alert('无法访问麦克风，请检查权限');
      }
    }
    this.panel.setMicLabel(this.micActive);
  }

  private writeNextPhrase(): void {
    const phrase = this.brushEngine.pickPhrase();
    const params = this.brushInterpolator.get();
    const { width, height } = this.renderer.getDimensions();
    const startX = width * 0.65;
    const startY = height * 0.2;
    const lineHeight = params.strokeWeight * 28;

    for (let i = 0; i < phrase.length; i++) {
      const stroke = this.brushEngine.generateCharStroke(
        phrase[i],
        startX,
        startY + i * lineHeight,
        params.strokeWeight * 12,
        params,
      );
      this.renderer.addStroke(stroke, this.brushEngine, params);
    }

    this.colony.setInkAttractors(
      Array.from({ length: phrase.length }, (_, i) => ({
        x: startX,
        y: startY + i * lineHeight,
      })),
    );
  }

  private resize(): void {
    const area = this.canvasWrapper.parentElement!;
    const w = area.clientWidth * 0.92;
    const h = area.clientHeight * 0.85;
    const aspect = 16 / 9;
    let width = w;
    let height = w / aspect;
    if (height > h) {
      height = h;
      width = h * aspect;
    }
    this.canvasWrapper.style.width = `${width}px`;
    this.canvasWrapper.style.height = `${height}px`;
    this.renderer.resize(width, height);
    this.renderer.clearBrushLayer(this.brushEngine);
    this.renderer.redrawAllStrokes(this.brushEngine, this.brushInterpolator.get());
  }

  private loop(now: number): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const params = this.brushInterpolator.update(now);
    const freq = this.micActive ? this.audioSource.getFrequencyData() : null;
    const audio = this.audioAnalyzer.analyze(freq);

    this.silentHint.style.display = audio.volume < 0.02 ? 'block' : 'none';

    const { width, height } = this.renderer.getDimensions();
    this.colony.update(dt, audio, width, height);
    this.timeline.update(dt);

    this.renderer.renderColony(this.colony);
    this.panel.updateAudioUI(audio.volume, audio.bass, audio.mid, audio.treble);
    this.panel.updateWorkAge(this.timeline.getAgeFormatted());

    const status = this.weatherService.getState();
    const bar = document.querySelector('#status-bar');
    if (bar) {
      bar.textContent = `${status.city} · ${Math.round(status.data.temp)}°C · ${this.colony.themeName} · WebGL ${this.renderer.isWebGLSupported() ? '✓' : '2D'}`;
    }

    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.audioSource.stop();
  }
}
