type EventMap = Record<string, unknown[]>;

export class EventBus<Events extends EventMap = EventMap> {
  private listeners = new Map<keyof Events, Set<(...args: unknown[]) => void>>();

  on<K extends keyof Events>(event: K, handler: (...args: Events[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    const wrapped = handler as (...args: unknown[]) => void;
    set.add(wrapped);
    return () => set.delete(wrapped);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) handler(...args);
  }
}
