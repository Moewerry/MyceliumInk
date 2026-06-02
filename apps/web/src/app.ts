import {
  AudioAnalyzer,
  BrushEngine,
  BrushParamsInterpolator,
  ColonySystem,
  CompositeRenderer,
  ErosionTimeline,
  DemoAudioSource,
  FileAudioSource,
  mapWeatherToBrush,
  MicrophoneAudioSource,
  TabAudioSource,
  resumeAudioContext,
  getSharedAudioContext,
  type AudioSource,
  VIRTUAL_CITIES,
  WeatherService,
} from '@mycelium-ink/core';
import { ControlPanel } from './ui/control-panel.js';

export class MyceliumApp {
  private weatherService = new WeatherService();
  private brushEngine = new BrushEngine();
  private brushInterpolator = new BrushParamsInterpolator(mapWeatherToBrush({ temp: 20, humidity: 60, windSpeed: 5, pressure: 1013 }));
  private colony = new ColonySystem(1000);
  private micSource = new MicrophoneAudioSource();
  private fileSource = new FileAudioSource();
  private tabSource = new TabAudioSource();
  private demoSource = new DemoAudioSource();
  private audioSource: AudioSource | null = null;
  private audioAnalyzer = new AudioAnalyzer();
  private timeline = new ErosionTimeline();
  private renderer!: CompositeRenderer;
  private panel!: ControlPanel;
  private audioActive = false;
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
      onAudioFile: (file) => void this.useAudioFile(file),
      onTabAudio: () => void this.useTabAudio(),
      onDemoAudio: () => void this.useDemoAudio(),
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
    this.resize();
    this.onWeatherUpdate();
    window.addEventListener('resize', () => this.resize());

    const { width, height } = this.renderer.getDimensions();
    this.colony.rebirth(width, height);

    this.renderer.clearBrushLayer(this.brushEngine);
    this.writeNextPhrase();
    this.lastTime = performance.now();
    this.loop(this.lastTime);
    // 不自动开麦克风，避免与标签页捕获冲突；用户自行选择音频源
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
    const { width, height } = this.renderer.getDimensions();
    if (width < 1 || height < 1) return;
    this.renderer.redrawAllStrokes(this.brushEngine, this.brushInterpolator.get());
  }

  private stopAllAudio(): void {
    this.micSource.stop();
    this.fileSource.stop();
    this.tabSource.stop();
    this.demoSource.stop();
    this.audioSource = null;
    this.audioActive = false;
  }

  private lastAudioError = '';

  private async switchSource(source: AudioSource, ...args: unknown[]): Promise<boolean> {
    for (const s of [this.micSource, this.fileSource, this.tabSource, this.demoSource]) {
      if (s !== source) s.stop();
    }
    source.stop();

    try {
      await source.start(...args);
      this.audioSource = source;
      this.audioActive = true;
      this.lastAudioError = '';
      this.panel.setAudioSourceLabel(source.label);
      this.panel.setMicLabel(source.mode === 'microphone');
      return true;
    } catch (e) {
      this.audioSource = null;
      this.audioActive = false;
      this.lastAudioError = e instanceof Error ? e.message : String(e);
      this.panel.setAudioSourceLabel('未连接');
      this.panel.setMicLabel(false);
      console.error('Audio source failed:', e);
      return false;
    }
  }

  private async enableMic(): Promise<boolean> {
    return this.switchSource(this.micSource);
  }

  private async useAudioFile(file: File): Promise<void> {
    await resumeAudioContext();
    const ok = await this.switchSource(this.fileSource, file);
    if (!ok) {
      alert(this.lastAudioError || '无法播放该音频文件，请换 mp3 / wav 格式');
      return;
    }
    await resumeAudioContext();
    this.panel.setAudioStatusHint(`正在播放：${file.name}`);
  }

  private async useDemoAudio(): Promise<void> {
    await resumeAudioContext();
    await this.switchSource(this.demoSource);
    await resumeAudioContext();
  }

  private async useTabAudio(): Promise<void> {
    await resumeAudioContext();
    const ok = await this.switchSource(this.tabSource);
    if (ok) {
      this.silentHint.style.display = 'block';
      this.silentHint.textContent =
        '捕获已连接。浏览器放歌→分享那个标签页；电脑客户端/耳机放歌→分享整个屏幕并勾选「分享系统音频」';
    } else {
      alert(
        '捕获失败。\n\n浏览器放歌：选「标签页」→ 正在放歌的页 → 勾选「分享标签页音频」\n电脑客户端/耳机放歌：选「整个屏幕」→ 勾选「分享系统音频」\n\n不要选 Mycelium Ink 本页。',
      );
    }
  }

  private async toggleMic(): Promise<void> {
    if (this.audioActive && this.audioSource?.mode === 'microphone') {
      this.stopAllAudio();
      this.panel.setMicLabel(false);
      this.panel.setAudioSourceLabel('未连接');
    } else {
      const ok = await this.enableMic();
      if (!ok) alert('无法访问麦克风，请检查权限');
    }
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
    let width = w > 0 ? w : 960;
    let height = width / aspect;
    if (h > 0 && height > h) {
      height = h;
      width = h * aspect;
    }
    width = Math.max(320, Math.round(width));
    height = Math.max(180, Math.round(height));
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
    const analysis = this.audioActive ? this.audioSource?.getAnalysisData() ?? null : null;
    const audio = this.audioAnalyzer.analyze(analysis);

    if (!this.audioActive) {
      this.silentHint.style.display = 'block';
      this.silentHint.textContent = '等待音频输入… 请允许麦克风，或上传音乐文件';
    } else if (audio.volume < 0.02) {
      this.silentHint.style.display = 'block';
      const ctxState = this.audioSource?.getContextState?.() ?? '';
      if (ctxState === 'suspended') {
        this.silentHint.textContent = '音频引擎已暂停 — 请点击「播放测试音」或重新上传文件';
      } else if (this.audioSource?.mode === 'tab') {
        this.silentHint.textContent =
          '已连接但无信号：电脑客户端/耳机放歌请选「整个屏幕」+「分享系统音频」；浏览器放歌请选放歌标签页 +「分享标签页音频」';
      } else if (this.audioSource?.mode === 'microphone') {
        this.silentHint.textContent =
          '戴耳机时麦克风收不到音乐。请用「捕获系统音频」或「上传音乐文件」';
      } else {
        this.silentHint.textContent = '音频已连接，等待信号…';
      }
    } else {
      this.silentHint.style.display = 'none';
    }

    const { width, height } = this.renderer.getDimensions();
    this.colony.update(dt, audio, width, height);
    this.timeline.update(dt);

    this.renderer.renderColony(this.colony);
    this.panel.updateAudioUI(audio.volume, audio.bass, audio.mid, audio.treble);

    const hint = this.audioSource?.getStatusHint?.() ?? '';
    const peak = this.audioAnalyzer.lastRawPeak;
    const ctxState = this.audioSource?.getContextState?.() ?? getSharedAudioContext().state;
    if (this.audioActive) {
      this.panel.setAudioStatusHint(
        hint || (peak > 0 ? `信号正常 · 峰值 ${peak}` : `等待信号 · 引擎 ${ctxState}`),
      );
    } else {
      this.panel.setAudioStatusHint('');
    }

    this.panel.updateWorkAge(this.timeline.getAgeFormatted());

    const status = this.weatherService.getState();
    const bar = document.querySelector('#status-bar');
    if (bar) {
      const src = this.audioSource?.label ?? '无';
      bar.textContent = `${status.city} · ${Math.round(status.data.temp)}°C · ${src} · ${Math.round(audio.volume * 100)}% · 峰值${peak}`;
    }

    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.stopAllAudio();
  }
}
