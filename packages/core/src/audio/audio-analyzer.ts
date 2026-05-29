import type { AudioFeatures } from '../types.js';
import { clamp } from '../utils/math.js';

export interface AudioSource {
  start(): Promise<void>;
  stop(): void;
  getFrequencyData(): Float32Array | null;
  isActive(): boolean;
}

/** Web 麦克风音频源 */
export class MicrophoneAudioSource implements AudioSource {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private data: Float32Array | null = null;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.context = new AudioContext();
    const source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    source.connect(this.analyser);
    this.data = new Float32Array(this.analyser.frequencyBinCount);
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.context?.close();
    this.context = null;
    this.analyser = null;
    this.stream = null;
  }

  getFrequencyData(): Float32Array | null {
    if (!this.analyser || !this.data) return null;
    this.analyser.getFloatFrequencyData(this.data as Float32Array);
    return this.data;
  }

  isActive(): boolean {
    return this.context?.state === 'running';
  }
}

/** 从频谱提取特征 */
export class AudioAnalyzer {
  private features: AudioFeatures = { bass: 0, mid: 0, treble: 0, volume: 0 };

  analyze(freqData: Float32Array | null): AudioFeatures {
    if (!freqData || freqData.length === 0) {
      this.features = { bass: 0, mid: 0, treble: 0, volume: 0 };
      return this.features;
    }

    const len = freqData.length;
    const third = Math.floor(len / 3);
    let bass = 0,
      mid = 0,
      treble = 0,
      total = 0;

    for (let i = 0; i < len; i++) {
      const v = Math.pow(10, freqData[i] / 20);
      total += v;
      if (i < third) bass += v;
      else if (i < third * 2) mid += v;
      else treble += v;
    }

    const norm = (x: number) => clamp(x / (len / 3) / 50, 0, 1);
    this.features = {
      bass: norm(bass),
      mid: norm(mid),
      treble: norm(treble),
      volume: clamp(total / len / 30, 0, 1),
    };
    return this.features;
  }

  getFeatures(): AudioFeatures {
    return { ...this.features };
  }
}
