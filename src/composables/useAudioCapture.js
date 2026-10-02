import { onBeforeUnmount, ref } from 'vue'

function preferredMimeType() {
  return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
    .find((type) => MediaRecorder.isTypeSupported(type))
}

async function preferMusicQuality(track) {
  const supported = navigator.mediaDevices.getSupportedConstraints()
  const constraints = {
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

export function useAudioCapture(onComplete) {
  const isRecording = ref(false)
  const recordingSource = ref(null)
  const elapsedSeconds = ref(0)
  let recorder
  let stream
  let chunks = []
  let elapsedTimer
  let startedAt = 0
  let disposed = false

  function releaseStream() {
    stream?.getTracks().forEach((track) => track.stop())
    stream = undefined
  }

  function stopRecording() {
    if (recorder?.state === 'recording') recorder.stop()
  }

  async function startRecording(source) {
    if (isRecording.value) return
    stream = source === 'system'
      ? await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
          systemAudio: 'include',
          surfaceSwitching: 'include',
        })
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
    })
    chunks = []
    recorder.ondataavailable = ({ data }) => data.size && chunks.push(data)
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
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
