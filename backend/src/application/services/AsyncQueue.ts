/** Unbounded single-consumer queue that can be consumed with `for await` and closed at any time. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private _items: T[] = []
  private _waiters: ((result: IteratorResult<T>) => void)[] = []
  private _closed = false

  push(item: T): void {
    if (this._closed) return
    const waiter = this._waiters.shift()
    if (waiter) {
      waiter({ value: item, done: false })
      return
    }
    this._items.push(item)
  }

  close(): void {
    this._closed = true
    for (const waiter of this._waiters.splice(0)) {
      waiter({ value: undefined, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this._items.length > 0) {
          return Promise.resolve({ value: this._items.shift() as T, done: false })
        }
        if (this._closed) {
          return Promise.resolve({ value: undefined, done: true })
        }
        return new Promise<IteratorResult<T>>((resolve) => this._waiters.push(resolve))
      },
      return: () => {
        this.close()
        return Promise.resolve({ value: undefined, done: true })
      }
    }
  }
}
