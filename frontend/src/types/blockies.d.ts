// @download/blockies ships no type declarations; this covers the part of its API we use.
declare module '@download/blockies' {
  export interface BlockiesOptions {
    /** Seed for the PRNG; colors not given explicitly are derived from it too. */
    seed?: string
    size?: number
    scale?: number
    color?: string
    bgcolor?: string
    spotcolor?: string
  }

  export function createIcon(opts?: BlockiesOptions): HTMLCanvasElement
  export function renderIcon(opts: BlockiesOptions, canvas: HTMLCanvasElement): HTMLCanvasElement
}
