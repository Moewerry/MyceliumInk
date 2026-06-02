import type { AudioFeatures } from '../types.js';
import { clamp } from '../utils/math.js';

export type AudioInputMode = 'microphone' | 'file' | 'tab' | 'demo';

export interface AudioAnalysisData {
  frequency: Uint8Array | null;
  timeDomain: Uint8Array | null;
}

export interface AudioSource {
  readonly mode: AudioInputMode;
  readonly label: string;
  start(...args: unknown[]): Promise<void>;
  stop(): void;
  getAnalysisData(): AudioAnalysisData;
  isActive(): boolean;
  getStatusHint?(): string;
  getContextState?(): string;
}

/** 全局共享 AudioContext（避免反复创建/关闭导致 suspended） */
let sharedContext: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (!sharedContext) {
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

export async function resumeAudioContext(): Promise<AudioContext> {
  const ctx = getSharedAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  return ctx;
}

abstract class AnalyserAudioSource implements AudioSource {
  abstract readonly mode: AudioInputMode;
  abstract readonly label: string;
  abstract start(...args: unknown[]): Promise<void>;

  protected context: AudioContext | null = null;
  protected analyser: AnalyserNode | null = null;
  protected frequency = new Uint8Array(0);
  protected timeDomain = new Uint8Array(0);
  protected gainNode: GainNode | null = null;
  private sourceNodes: AudioNode[] = [];

  protected trackSource(node: AudioNode): void {
    this.sourceNodes.push(node);
  }

  protected connectToAnalyser(source: AudioNode): void {
    source.connect(this.analyser!);
    this.trackSource(source);
  }

  protected finishAnalyserChain(): void {
    if (!this.context || !this.analyser) return;
    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = 0.001;
    this.analyser.connect(this.gainNode);
    this.gainNode.connect(this.context.destination);
  }

  protected wireAnalyser(source: AudioNode): void {
    if (!this.context || !this.analyser) return;
    this.connectToAnalyser(source);
    this.finishAnalyserChain();
  }

  protected async bindContext(): Promise<AudioContext> {
    this.context = await resumeAudioContext();
    return this.context;
  }

  protected setupAnalyser(): void {
    if (!this.context) return;
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.5;
    this.analyser.minDecibels = -100;
    this.analyser.maxDecibels = -30;
    this.frequency = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomain = new Uint8Array(this.analyser.fftSize);
  }

  protected releaseNodes(): void {
    for (const node of this.sourceNodes) {
      try {
        node.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.sourceNodes = [];
    this.analyser?.disconnect();
    this.gainNode?.disconnect();
    this.gainNode = null;
    this.analyser = null;
    this.frequency = new Uint8Array(0);
    this.timeDomain = new Uint8Array(0);
    this.context = null;
  }

  getAnalysisData(): AudioAnalysisData {
    if (!this.analyser) return { frequency: null, timeDomain: null };
    if (this.context?.state === 'suspended') {
      void resumeAudioContext();
    }
    this.analyser.getByteFrequencyData(this.frequency);
    this.analyser.getByteTimeDomainData(this.timeDomain);
    return { frequency: this.frequency, timeDomain: this.timeDomain };
  }

  isActive(): boolean {
    return !!this.analyser;
  }

  getContextState(): string {
    return this.context?.state ?? getSharedAudioContext().state;
  }

  getStatusHint(): string {
    const state = this.getContextState();
    if (state === 'suspended') return '⚠ 音频引擎暂停 — 请点击「播放测试音」或再选一次文件';
    return '';
  }

  abstract stop(): void;
}

/** 麦克风 */
export class MicrophoneAudioSource extends AnalyserAudioSource {
  readonly mode = 'microphone' as const;
  readonly label = '麦克风';
  private stream: MediaStream | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;

  async start(): Promise<void> {
    this.stop();
    await this.bindContext();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    });
    await resumeAudioContext();
    this.setupAnalyser();
    this.mediaSource = this.context!.createMediaStreamSource(this.stream);
    this.wireAnalyser(this.mediaSource);
  }

  stop(): void {
    this.mediaSource?.disconnect();
    this.mediaSource = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.releaseNodes();
  }
}

/** 本地音频文件 */
export class FileAudioSource extends AnalyserAudioSource {
  readonly mode = 'file' as const;
  readonly label = '音频文件';
  private bufferSource: AudioBufferSourceNode | null = null;
  private fileName = '';

  async start(file?: unknown): Promise<void> {
    if (!(file instanceof File)) throw new Error('需要音频文件');
    this.stop();
    this.fileName = file.name;

    await this.bindContext();
    const arrayBuffer = await file.arrayBuffer();
    await resumeAudioContext();

    this.setupAnalyser();

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await this.context!.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      throw new Error(`无法解码「${file.name}」，请换 mp3 / wav / ogg 格式`);
    }

    await resumeAudioContext();

    this.bufferSource = this.context!.createBufferSource();
    this.bufferSource.buffer = audioBuffer;
    this.bufferSource.loop = true;
    this.wireAnalyser(this.bufferSource);
    this.bufferSource.start(0);
    this.trackSource(this.bufferSource);
  }

  stop(): void {
    try {
      this.bufferSource?.stop();
    } catch {
      /* 已停止 */
    }
    this.bufferSource = null;
    this.fileName = '';
    this.releaseNodes();
  }

  override getStatusHint(): string {
    if (this.fileName) {
      const state = this.getContextState();
      return `正在播放：${this.fileName} · 引擎 ${state}`;
    }
    return '';
  }
}

/** 标签页 / 系统音频 */
export class TabAudioSource extends AnalyserAudioSource {
  readonly mode = 'tab' as const;
  readonly label = '标签页音频';
  private stream: MediaStream | null = null;
  private streamSource: MediaStreamAudioSourceNode | null = null;
  private elementSource: MediaElementAudioSourceNode | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private onTrackEnded: (() => void) | null = null;

  async start(): Promise<void> {
    this.stop();
    await this.bindContext();

    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    await resumeAudioContext();

    const audioTrack = this.stream.getAudioTracks()[0];
    if (!audioTrack) {
      this.stop();
      throw new Error('未捕获到音频，请勾选「分享标签页音频」或「分享系统音频」');
    }
    audioTrack.enabled = true;

    this.videoEl = document.createElement('video');
    this.videoEl.playsInline = true;
    this.videoEl.autoplay = true;
    this.videoEl.muted = false;
    this.videoEl.volume = 0.01;
    this.videoEl.srcObject = this.stream;
    document.body.appendChild(this.videoEl);
    await this.videoEl.play();

    this.setupAnalyser();

    this.streamSource = this.context!.createMediaStreamSource(this.stream);
    this.connectToAnalyser(this.streamSource);

    try {
      this.elementSource = this.context!.createMediaElementSource(this.videoEl);
      this.connectToAnalyser(this.elementSource);
    } catch {
      /* 部分环境只允许一种接法 */
    }

    this.finishAnalyserChain();

    this.onTrackEnded = () => this.stop();
    for (const track of this.stream.getTracks()) {
      track.addEventListener('ended', this.onTrackEnded);
    }
  }

  stop(): void {
    if (this.stream && this.onTrackEnded) {
      for (const track of this.stream.getTracks()) {
        track.removeEventListener('ended', this.onTrackEnded);
      }
    }
    this.onTrackEnded = null;
    this.streamSource = null;
    this.elementSource = null;
    this.videoEl?.pause();
    if (this.videoEl) this.videoEl.srcObject = null;
    this.videoEl?.remove();
    this.videoEl = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.releaseNodes();
  }

  override getStatusHint(): string {
    const track = this.stream?.getAudioTracks()[0];
    if (!track) return '未连接';
    if (track.muted) return '⚠ 浏览器未送出音频 — 请勾选「分享系统/标签页音频」后重新捕获';
    return `音频轨 live · 引擎 ${this.getContextState()}`;
  }
}

/** 内置测试音 */
export class DemoAudioSource extends AnalyserAudioSource {
  readonly mode = 'demo' as const;
  readonly label = '测试音';
  private oscillator: OscillatorNode | null = null;
  private lfo: OscillatorNode | null = null;
  private oscGain: GainNode | null = null;

  async start(): Promise<void> {
    this.stop();
    await this.bindContext();
    this.setupAnalyser();

    this.oscillator = this.context!.createOscillator();
    this.oscillator.type = 'sawtooth';
    this.oscillator.frequency.value = 120;

    this.lfo = this.context!.createOscillator();
    this.lfo.frequency.value = 1.5;
    const lfoGain = this.context!.createGain();
    lfoGain.gain.value = 60;
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.oscillator.frequency);
    this.trackSource(this.lfo);
    this.trackSource(lfoGain);

    this.oscGain = this.context!.createGain();
    this.oscGain.gain.value = 0.15;
    this.oscillator.connect(this.oscGain);
    this.wireAnalyser(this.oscGain);
    this.trackSource(this.oscillator);

    this.oscillator.start();
    this.lfo.start();
  }

  stop(): void {
    try {
      this.lfo?.stop();
      this.oscillator?.stop();
    } catch {
      /* ignore */
    }
    this.lfo = null;
    this.oscillator = null;
    this.oscGain = null;
    this.releaseNodes();
  }

  override getStatusHint(): string {
    return `测试音 · 引擎 ${this.getContextState()}`;
  }
}

/** 从频谱 + 时域 RMS 提取特征 */
export class AudioAnalyzer {
  private features: AudioFeatures = { bass: 0, mid: 0, treble: 0, volume: 0 };
  lastRawPeak = 0;

  analyze(data: AudioAnalysisData | null): AudioFeatures {
    if (!data?.frequency || !data.timeDomain || data.frequency.length === 0) {
      this.lastRawPeak = 0;
      this.features = { bass: 0, mid: 0, treble: 0, volume: 0 };
      return this.features;
    }

    const freq = data.frequency;
    const time = data.timeDomain;
    const len = freq.length;
    const third = Math.floor(len / 3);

    let bass = 0,
      mid = 0,
      treble = 0,
      freqSum = 0,
      peak = 0;
    for (let i = 0; i < len; i++) {
      peak = Math.max(peak, freq[i]);
      const v = freq[i] / 255;
      freqSum += v;
      if (i < third) bass += v;
      else if (i < third * 2) mid += v;
      else treble += v;
    }
    this.lastRawPeak = peak;

    let sumSq = 0;
    for (let i = 0; i < time.length; i++) {
      const v = (time[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / time.length);
    const freqLevel = freqSum / len;

    const norm = (x: number) => clamp(x / (len / 3) / 0.2, 0, 1);
    this.features = {
      bass: norm(bass),
      mid: norm(mid),
      treble: norm(treble),
      volume: clamp(Math.max(rms * 6, freqLevel * 4, peak / 200), 0, 1),
    };
    return this.features;
  }

  getFeatures(): AudioFeatures {
    return { ...this.features };
  }
}
