// Encodes PCM channel data to Ogg Vorbis off the main thread.
import { createOggEncoder } from 'wasm-media-encoders'

const CHUNK_SAMPLES = 131072
let encoderPromise

self.onmessage = async ({ data }) => {
  const { channels, sampleRate, vbrQuality } = data
  try {
    if (!encoderPromise) encoderPromise = createOggEncoder()
    const encoder = await encoderPromise
    encoder.configure({ channels: channels.length, sampleRate, vbrQuality })
    const total = channels[0].length
    const parts = []
    for (let start = 0; start < total; start += CHUNK_SAMPLES) {
      const end = Math.min(total, start + CHUNK_SAMPLES)
      const chunk = encoder.encode(channels.map((channel) => channel.subarray(start, end)))
      if (chunk.length) parts.push(new Uint8Array(chunk))
      self.postMessage({ progress: Math.round((end / total) * 100) })
    }
    const tail = encoder.finalize()
    if (tail.length) parts.push(new Uint8Array(tail))
    let size = 0
    for (const part of parts) size += part.length
    const ogg = new Uint8Array(size)
    let offset = 0
    for (const part of parts) {
      ogg.set(part, offset)
      offset += part.length
    }
    self.postMessage({ ok: true, ogg }, [ogg.buffer])
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
