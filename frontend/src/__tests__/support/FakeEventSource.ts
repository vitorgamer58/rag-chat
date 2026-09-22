type Listener = (event: MessageEvent<string>) => void

/** Minimal stand-in for the browser's EventSource, just enough to drive the store's stream logic in tests. */
export class FakeEventSource {
  static instances: FakeEventSource[] = []

  readonly url: string
  closed = false
  private listeners = new Map<string, Listener[]>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  close(): void {
    this.closed = true
  }

  /** Test helper: dispatches a named SSE event with a JSON-encoded payload, like the real stream would. */
  emit(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent<string>)
    }
  }

  static reset(): void {
    FakeEventSource.instances = []
  }

  static last(): FakeEventSource {
    const instance = FakeEventSource.instances[FakeEventSource.instances.length - 1]
    if (!instance) throw new Error('No FakeEventSource was constructed')
    return instance
  }
}
