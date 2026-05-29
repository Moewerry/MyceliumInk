import type { AudioSource } from '../audio/audio-analyzer.js';

/** 跨平台适配接口 */
export interface PlatformAdapter {
  captureSystemAudio(): Promise<MediaStream | null>;
  exportVideo?(): Promise<void>;
  createAudioSource(type: 'microphone' | 'system'): AudioSource;
}
