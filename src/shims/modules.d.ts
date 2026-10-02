declare module 'fft.js' {
  export default class FFT {
    constructor(size: number)
    createComplexArray(): number[]
    realTransform(output: ArrayLike<number>, input: ArrayLike<number>): void
    transform(output: ArrayLike<number>, input: ArrayLike<number>): void
  }
}

declare module 'essentia.js/dist/essentia.js-core.es.js' {
  export interface EssentiaVector {
    size(): number
    delete(): void
  }
  export default class Essentia {
    constructor(wasm: unknown)
    arrayToVector(values: Float32Array): EssentiaVector
    vectorToArray(vector: EssentiaVector): Float32Array
    RhythmExtractor2013(signal: EssentiaVector, maxTempo: number, method: string, minTempo: number): {
      bpm: number
      confidence: number
      ticks: EssentiaVector
      estimates: EssentiaVector
      bpmIntervals: EssentiaVector
    }
  }
}

declare module 'essentia.js/dist/essentia-wasm.es.js' {
  export const EssentiaWASM: unknown
}
