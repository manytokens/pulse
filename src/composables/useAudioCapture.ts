import { onBeforeUnmount, ref } from 'vue'

export type CaptureSource = 'microphone' | 'system'

function preferredMimeType(): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
    .find((type) => MediaRecorder.isTypeSupported(type))
}

async function preferMusicQuality(track: MediaStreamTrack): Promise<void> {
  const supported = navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean>
  const constraints: Record<string, unknown> = {
    channelCount: { ideal: 2 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    suppressLocalAudioPlayback: false,
  }
  for (const [name, value] of Object.entries(constraints)) {
    if (!supported[name]) continue
    try {
      await track.applyConstraints({ [name]: value })
    } catch {
      // Display-capture constraints are best-effort and browser-dependent.
    }
  }
}

export function useAudioCapture(onComplete?: (blob: Blob) => void) {
  const isRecording = ref(false)
  const recordingSource = ref<CaptureSource | null>(null)
  const elapsedSeconds = ref(0)
  let recorder: MediaRecorder | undefined
  let stream: MediaStream | undefined
  let chunks: Blob[] = []
  let elapsedTimer: number | undefined
  let startedAt = 0
  let disposed = false

  function releaseStream(): void {
    stream?.getTracks().forEach((track) => track.stop())
    stream = undefined
  }

  function stopRecording(): void {
    if (recorder?.state === 'recording') recorder.stop()
  }

  async function startRecording(source: CaptureSource): Promise<void> {
    if (isRecording.value) return
    stream = source === 'system'
      ? await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
          systemAudio: 'include',
          surfaceSwitching: 'include',
        } as DisplayMediaStreamOptions)
      : await navigator.mediaDevices.getUserMedia({ audio: true })

    if (!stream.getAudioTracks().length) {
      releaseStream()
      throw new Error('No audio track was shared')
    }

    await Promise.all(stream.getAudioTracks().map(preferMusicQuality))
    const mimeType = preferredMimeType()
    const audioOnlyStream = new MediaStream(stream.getAudioTracks())
    recorder = new MediaRecorder(audioOnlyStream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 320000,
      audioBitrateMode: 'constant',
    } as MediaRecorderOptions)
    chunks = []
    recorder.ondataavailable = ({ data }) => {
      if (data.size) chunks.push(data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
      isRecording.value = false
      recordingSource.value = null
      window.clearInterval(elapsedTimer)
      releaseStream()
      if (!disposed && blob.size) onComplete?.(blob)
    }
    stream.getTracks().forEach((track) => track.addEventListener('ended', stopRecording, { once: true }))
    recorder.start(250)
    isRecording.value = true
    recordingSource.value = source
    elapsedSeconds.value = 0
    startedAt = performance.now()
    elapsedTimer = window.setInterval(() => {
      elapsedSeconds.value = (performance.now() - startedAt) / 1000
    }, 200)
  }

  onBeforeUnmount(() => {
    disposed = true
    window.clearInterval(elapsedTimer)
    if (recorder?.state === 'recording') recorder.stop()
    releaseStream()
  })

  return { isRecording, recordingSource, elapsedSeconds, startRecording, stopRecording }
}
