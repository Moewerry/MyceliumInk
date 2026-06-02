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
  /** 竖排书写槽位：每写一句换一列/一行 */
  private phraseSlot = 0;
  private inkAttractors: { x: number; y: number }[] = [];

  mount(root: HTMLElement): void {
    root.innerHTML = `
      <div class="app-layout">
        <nav class="edge-bar">
          <button class="edge-btn active" data-panel="weather" title="天气">☁</button>
          <button class="edge-btn" data-panel="audio" title="声音">♪</button>
          <button class="edge-btn" data-panel="colony" title="菌落">✿</button>
          <button class="edge-btn" data-panel="time" title="时间">◷</button>
          <div class="edge-spacer"></div>
          <button class="edge-btn" id="btn-theme" title="主题">☀</button>
        </nav>
        <main class="canvas-area">
          <div class="top-bar">
            <div class="logo">
              <img class="logo-mark" src="/logo.png" alt="Mycelium Ink" />
              <span class="logo-title">
                Mycelium Ink
                <img class="logo-seal" src="/seal-1.png" alt="" aria-hidden="true" />
              </span>
            </div>
            <div class="top-actions">
              <button id="btn-fullscreen">全屏</button>
              <button id="btn-export">导出 PNG</button>
            </div>
          </div>
          <div class="canvas-wrapper" id="canvas-wrapper">
            <div class="canvas-scenery" aria-hidden="true"></div>
          </div>
          <p class="silent-hint" id="silent-hint">静默中，菌落进入休眠…</p>
          <div class="status-bar" id="status-bar">
            <span class="status-dot" id="status-dot"></span>
            <span id="status-text">状态加载中…</span>
            <div class="status-wave" id="status-wave" aria-hidden="true"></div>
          </div>
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
      onClearCanvas: () => this.clearCanvas(),
      onBackgroundPreset: (url) => this.setBackgroundFromPreset(url),
      onBackgroundUpload: (file) => void this.setBackgroundFromUpload(file),
    });

    document.body.appendChild(this.panel.element);
    this.panel.openPanel('weather');
    this.initStatusWave();
    this.initBackgroundFromStorage();
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

  private setBackgroundCss(url: string): void {
    document.documentElement.style.setProperty('--bg-main-url', `url("${url}")`);
  }

  private initBackgroundFromStorage(): void {
    try {
      const mode = localStorage.getItem('mi:bg:mode') ?? '';
      const url = localStorage.getItem('mi:bg:url') ?? '';
      if (url) {
        this.setBackgroundCss(url);
        if (mode === 'preset' && (url === '/bg-1.png' || url === '/bg-2.png')) {
          this.panel.setSelectedBackground(url);
        }
      } else {
        // 默认使用 bg-1 作为主背景（若存在）
        this.setBackgroundFromPreset('/bg-1.png');
      }
    } catch {
      // ignore
    }
  }

  private setBackgroundFromPreset(url: string): void {
    this.setBackgroundCss(url);
    this.panel.setSelectedBackground(url);
    try {
      localStorage.setItem('mi:bg:mode', 'preset');
      localStorage.setItem('mi:bg:url', url);
    } catch {
      // ignore
    }
  }

  private async setBackgroundFromUpload(file: File): Promise<void> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.readAsDataURL(file);
    });
    if (!dataUrl) return;
    this.setBackgroundCss(dataUrl);
    try {
      localStorage.setItem('mi:bg:mode', 'upload');
      localStorage.setItem('mi:bg:url', dataUrl);
    } catch {
      // 如果图片过大导致存储失败，就只在本次会话生效
    }
  }

  private initStatusWave(): void {
    const wave = document.querySelector('#status-wave');
    if (!wave || wave.children.length) return;
    for (let i = 0; i < 12; i++) {
      const bar = document.createElement('span');
      bar.style.height = '4px';
      wave.appendChild(bar);
    }
  }

  private updateStatusBar(
    city: string,
    temp: number,
    volume: number,
    active: boolean,
    bass: number,
    mid: number,
    treble: number,
  ): void {
    const text = document.querySelector('#status-text');
    if (text) {
      const audioPart = active ? `音频输入活跃 · 音量 ${Math.round(volume * 100)}%` : '等待音频输入';
      text.textContent = `状态: ${city} · ${Math.round(temp)}°C · ${audioPart}`;
    }

    const dot = document.querySelector('#status-dot');
    if (dot) dot.classList.toggle('active', active && volume > 0.02);

    const wave = document.querySelector('#status-wave');
    if (wave) {
      const bars = wave.querySelectorAll('span');
      const bands = [bass, mid, treble];
      bars.forEach((bar, i) => {
        const band = bands[i % 3];
        const h = active ? 4 + band * 12 + Math.sin(performance.now() * 0.008 + i) * 2 : 4;
        (bar as HTMLElement).style.height = `${h}px`;
      });
    }
  }

  private bindUI(root: HTMLElement): void {
    root.querySelectorAll('.edge-btn[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.panel as 'weather' | 'audio' | 'colony' | 'time';
        this.panel.openPanel(tab);
        root.querySelectorAll('.edge-btn[data-panel]').forEach((b) => b.classList.remove('active'));
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
    // 已沉积的旧句保留落笔时的气象笔刷，不随滑块重绘
  }

  private clearCanvas(): void {
    this.phraseSlot = 0;
    this.inkAttractors = [];
    this.renderer.clearPhraseLayers(this.brushEngine);
    const { width, height } = this.renderer.getDimensions();
    this.colony.rebirth(width, height);
    this.colony.setInkAttractors([]);
    this.panel.updatePhraseLayerHint(0, 12);
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
    if (width < 1 || height < 1) return;

    const lineHeight = params.strokeWeight * 28;
    const columnWidth = params.strokeWeight * 34;
    const colsPerRow = Math.max(2, Math.floor((width * 0.75) / columnWidth));
    const row = Math.floor(this.phraseSlot / colsPerRow);
    const col = this.phraseSlot % colsPerRow;

    // 竖排：从右向左逐列，行满后下移（层积书写）
    const startX = width * 0.82 - col * columnWidth + (Math.random() - 0.5) * 8;
    const startY = height * (0.12 + row * 0.28) + (Math.random() - 0.5) * 16;
    this.phraseSlot++;

    const phrasePoints: { x: number; y: number }[] = [];
    const strokes: ReturnType<BrushEngine['generateCharStroke']>[] = [];
    for (let i = 0; i < phrase.length; i++) {
      const y = startY + i * lineHeight;
      phrasePoints.push({ x: startX, y });
      strokes.push(
        this.brushEngine.generateCharStroke(
          phrase[i],
          startX,
          y,
          params.strokeWeight * 12,
          params,
        ),
      );
    }

    this.renderer.addPhraseLayer(strokes, params, phrasePoints, this.brushEngine);
    this.inkAttractors = this.renderer.getAllInkPoints();
    this.colony.setInkAttractors(this.inkAttractors);
    this.panel.updatePhraseLayerHint(this.renderer.getPhraseLayerCount(), 12);
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
    this.renderer.redrawPhraseLayers(this.brushEngine);
  }

  private loop(now: number): void {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.brushInterpolator.update(now);
    const analysis = this.audioActive ? this.audioSource?.getAnalysisData() ?? null : null;
    const audio = this.audioAnalyzer.analyze(analysis);

    if (!this.audioActive) {
      this.silentHint.style.display = 'block';
      this.silentHint.textContent = '静默中，菌落进入休眠…';
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
    this.updateStatusBar(
      status.city,
      status.data.temp,
      audio.volume,
      this.audioActive,
      audio.bass,
      audio.mid,
      audio.treble,
    );

    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.stopAllAudio();
  }
}
