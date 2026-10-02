import { onBeforeUnmount, ref } from 'vue'

const TARGET_SAMPLE_RATE = 44100

async function decodeMono(blob) {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return { samples: new Float32Array(rendered.getChannelData(0)), duration: decoded.duration }
  } finally {
    await context.close()
  }
}

export function useEssentiaAnalysis() {
  const analyzing = ref(false)
  const analysisError = ref('')
  const result = ref(null)
  let worker
  let jobId = 0

  function ensureWorker() {
    if (!worker) worker = new Worker(new URL('../workers/essentia.worker.js', import.meta.url), { type: 'module' })
    return worker
  }

  async function analyze(blob) {
    analyzing.value = true
    analysisError.value = ''
    result.value = null
    const id = ++jobId
    try {
      const decoded = await decodeMono(blob)
      if (id !== jobId) return null
      const activeWorker = ensureWorker()
      const rhythm = await new Promise((resolve, reject) => {
        const handleMessage = ({ data }) => {
          if (data.id !== id) return
          cleanup()
          data.error ? reject(new Error(data.error)) : resolve(data.result)
        }
        const handleError = (event) => {
          cleanup()
          activeWorker.terminate()
          if (worker === activeWorker) worker = undefined
          reject(event.error || new Error(event.message))
        }
        const cleanup = () => {
          activeWorker.removeEventListener('message', handleMessage)
          activeWorker.removeEventListener('error', handleError)
        }
        activeWorker.addEventListener('message', handleMessage)
        activeWorker.addEventListener('error', handleError)
        activeWorker.postMessage({ id, samples: decoded.samples.buffer }, [decoded.samples.buffer])
      })
      if (id !== jobId) return null
      result.value = { ...rhythm, duration: decoded.duration }
      return result.value
    } catch (error) {
      if (id === jobId) analysisError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      if (id === jobId) analyzing.value = false
    }
  }

  onBeforeUnmount(() => {
    jobId += 1
    worker?.terminate()
    worker = undefined
  })
  return { analyzing, analysisError, result, analyze }
}
