import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('myceliumDesktop', {
  platform: 'electron',
  features: {
    systemAudio: true,
  },
});
