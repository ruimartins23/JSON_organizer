/**
 * Records the microphone and a shared tab's audio into a single mixed file,
 * so a session can be captured without OBS. Both streams are joined through a
 * Web Audio graph and written by MediaRecorder.
 */

import { isMac } from './platform';
import { appendChunk, beginStoredRecording } from './recordingStore';

export type RecorderErrorCode = 'unsupported' | 'cancelled' | 'no-tab-audio' | 'no-mic' | 'empty';

export class RecorderError extends Error {
  code: RecorderErrorCode;
  constructor(code: RecorderErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'RecorderError';
  }
}

export interface Levels {
  mic: number;
  tab: number;
}

export interface ActiveRecording {
  /** What Chrome actually handed over, so a wrong pick is visible. */
  readonly sharedLabel: string;
  /** Current loudness of each source, 0 to 1, for the meters. */
  levels(): Levels;
  /** Adjusts a source's volume while recording. 1 is untouched. */
  setGain(source: keyof Levels, value: number): void;
  /** Called when the share ends from Chrome's own "Stop sharing" bar. */
  onExternalStop(callback: () => void): void;
  /** Stops every stream and resolves with the recording. */
  stop(): Promise<File>;
}

export interface RecordOptions {
  /** Echo and noise reduction on the microphone. */
  cleanMic: boolean;
  /** Name for the resulting file, minus the extension. */
  baseName: string;
  /** Starting volume for each source, 1 being untouched. */
  gains: Levels;
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

export function canRecord(): boolean {
  return (
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof window.MediaRecorder === 'function'
  );
}

function pickMimeType(): string {
  return MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported(type)) ?? '';
}

export async function startRecording({ cleanMic, baseName, gains }: RecordOptions): Promise<ActiveRecording> {
  if (!canRecord()) {
    throw new RecorderError('unsupported', 'This browser cannot capture tab audio. Chrome or Edge can.');
  }

  let display: MediaStream;
  try {
    // Chrome only offers the audio checkbox when video is requested as well.
    // The video track goes unused, but stopping it would end the whole share.
    display = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch {
    throw new RecorderError('cancelled', 'Screen sharing was cancelled, so nothing is being recorded.');
  }

  if (display.getAudioTracks().length === 0) {
    const shared = display.getVideoTracks()[0]?.label ?? '';
    display.getTracks().forEach(track => track.stop());
    // On macOS only the Chrome Tab pane carries audio. Windows also offers it
    // on Entire Screen, so pointing a Windows user away from that would be wrong.
    const where = isMac
      ? 'choose the Chrome Tab pane, not Entire Screen or Window'
      : 'choose the Chrome Tab pane, or Entire Screen with "share system audio" ticked (Window never carries audio)';
    throw new RecorderError(
      'no-tab-audio',
      `That share had no audio${shared ? ` (${shared})` : ''}. In the dialog ${where}, ` +
        'pick the tab the agent is playing in, and turn on the audio toggle.',
    );
  }

  let mic: MediaStream;
  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: cleanMic, noiseSuppression: cleanMic, autoGainControl: cleanMic },
    });
  } catch {
    display.getTracks().forEach(track => track.stop());
    throw new RecorderError('no-mic', 'The microphone is not available. Check this site’s permissions and try again.');
  }

  const context = new AudioContext();
  // Created after an await, so the gesture may already be spent and the context
  // can come up suspended. A suspended graph records pure silence.
  if (context.state === 'suspended') await context.resume();
  const destination = context.createMediaStreamDestination();

  // Each source gets its own volume control, then feeds both the mix and its
  // own analyser. The analyser sits after the gain so the meters show what is
  // actually being recorded, which is what makes the sliders readable.
  const tap = (stream: MediaStream, startingGain: number) => {
    const source = context.createMediaStreamSource(stream);
    const gain = context.createGain();
    gain.gain.value = startingGain;
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(gain);
    gain.connect(analyser);
    gain.connect(destination);
    // Chrome collects a MediaStreamAudioSourceNode, and its stream, once
    // nothing references them, and the audio silently stops. Hold both.
    return { gain, analyser, source, stream };
  };

  const micChannel = tap(mic, gains.mic);
  const tabChannel = tap(new MediaStream(display.getAudioTracks()), gains.tab);
  const retained = [micChannel, tabChannel];

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(
    destination.stream,
    mimeType ? { mimeType, audioBitsPerSecond: 128_000 } : undefined,
  );
  const recordedType = recorder.mimeType || mimeType || 'audio/webm';
  const fileName = `${baseName}.${recordedType.includes('mp4') ? 'mp4' : 'webm'}`;

  // Mirror every chunk to disk as it arrives. If the tab dies mid-call the take
  // is still recoverable; if storage refuses, the recording carries on in memory.
  void beginStoredRecording(fileName, recordedType).catch(() => {});

  const chunks: Blob[] = [];
  recorder.ondataavailable = event => {
    if (event.data.size === 0) return;
    chunks.push(event.data);
    void appendChunk(event.data).catch(() => {});
  };
  recorder.start(1000);

  let externalStop: (() => void) | null = null;
  display.getTracks().forEach(track => {
    track.addEventListener('ended', () => externalStop?.());
  });

  const samples = new Uint8Array(micChannel.analyser.fftSize);
  const loudness = (analyser: AnalyserNode) => {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      const value = (samples[i] - 128) / 128;
      sum += value * value;
    }
    // Speech sits low on a linear scale, so lift it into a readable range.
    return Math.min(1, Math.sqrt(sum / samples.length) * 3);
  };

  const release = () => {
    display.getTracks().forEach(track => track.stop());
    mic.getTracks().forEach(track => track.stop());
    retained.forEach(channel => channel.source.disconnect());
    context.close();
  };

  let finished = false;

  return {
    sharedLabel: display.getAudioTracks()[0]?.label || display.getVideoTracks()[0]?.label || 'the shared tab',
    levels: () => ({ mic: loudness(micChannel.analyser), tab: loudness(tabChannel.analyser) }),
    setGain: (source, value) => {
      const channel = source === 'mic' ? micChannel : tabChannel;
      // Ramped, so dragging the slider does not click in the recording.
      channel.gain.gain.setTargetAtTime(value, context.currentTime, 0.015);
    },
    onExternalStop: callback => {
      externalStop = callback;
    },
    stop: () =>
      new Promise<File>((resolve, reject) => {
        if (finished) {
          reject(new RecorderError('empty', 'That recording was already saved.'));
          return;
        }
        finished = true;

        const finalize = () => {
          release();
          if (chunks.length === 0) {
            reject(new RecorderError('empty', 'Nothing was captured, so there is no file to trim.'));
            return;
          }
          resolve(new File([new Blob(chunks, { type: recordedType })], fileName, { type: recordedType }));
        };

        if (recorder.state === 'inactive') {
          finalize();
        } else {
          recorder.onstop = finalize;
          recorder.stop();
        }
      }),
  };
}
