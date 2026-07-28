import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { AudioLines, ChevronDown, Play, Pause, Scissors, RotateCcw } from 'lucide-react';
import { decodeAudioFile, encodeAudio, waveformPeaks, formatClock } from '../utils/audio';
import type { AudioFormat } from '../utils/audio';

interface AudioToolProps {
  /** Name the exported file will use, minus the extension. */
  baseName: string;
  format: AudioFormat;
  onFormatChange: (format: AudioFormat) => void;
  onAudioReady: (blob: Blob | null) => void;
}

const BUCKETS = 600;
const HANDLE_HIT_PX = 10;
const DRAG_THRESHOLD_PX = 4;

export function AudioTool({ baseName, format, onFormatChange, onAudioReady }: AudioToolProps) {
  const [open, setOpen] = useState(false);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [status, setStatus] = useState<'idle' | 'decoding' | 'encoding'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState<number | null>(null);
  /** Where playback starts; moved by clicking the waveform. */
  const [cursor, setCursor] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioBufferSourceNode | null>(null);
  const dragRef = useRef<'start' | 'end' | 'new' | 'pending' | null>(null);
  const pendingRef = useRef<{ x: number; time: number }>({ x: 0, time: 0 });
  const rafRef = useRef<number | null>(null);

  const peaks = useMemo(() => (buffer ? waveformPeaks(buffer, BUCKETS) : []), [buffer]);
  const trimmed = Math.max(0, end - start);
  const fileName = `${baseName}.${format}`;

  const stopPlayback = useCallback(() => {
    nodeRef.current?.stop();
    nodeRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPlaying(false);
    setPlayhead(null);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  const loadFile = async (file: File) => {
    stopPlayback();
    setError(null);
    setStatus('decoding');
    onAudioReady(null);
    try {
      const decoded = await decodeAudioFile(file);
      setBuffer(decoded);
      setSourceName(file.name);
      setStart(0);
      setEnd(decoded.duration);
      setCursor(0);
    } catch {
      setError('Could not read audio from that file. Try an .mp4, .m4a, .mp3 or .wav.');
      setBuffer(null);
    } finally {
      setStatus('idle');
    }
  };

  /** Play the selection from `from` (defaults to the cursor). */
  const playFrom = useCallback((from: number) => {
    if (!buffer) return;
    nodeRef.current?.stop();
    nodeRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const begin = Math.min(Math.max(from, start), Math.max(start, end - 0.05));
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    const startedAt = ctx.currentTime;
    node.onended = () => stopPlayback();
    node.start(0, begin, Math.max(0.05, end - begin));
    nodeRef.current = node;
    setPlaying(true);

    const tick = () => {
      setPlayhead(begin + (ctx.currentTime - startedAt));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, [buffer, start, end, stopPlayback]);

  const preview = () => {
    if (playing) return stopPlayback();
    playFrom(cursor);
  };

  const convert = async () => {
    if (!buffer) return;
    stopPlayback();
    setError(null);
    setStatus('encoding');
    setProgress(0);
    try {
      const blob = await encodeAudio(format, buffer, start, end, setProgress);
      onAudioReady(blob);
    } catch (e: any) {
      setError(`Conversion failed: ${e?.message || e}`);
      onAudioReady(null);
    } finally {
      setStatus('idle');
    }
  };

  // ---- Drag selection directly on the waveform ----
  const timeAt = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return 0;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * buffer.duration;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!buffer) return;
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const pxPerSec = rect.width / buffer.duration;
    const x = e.clientX - rect.left;

    if (Math.abs(x - start * pxPerSec) <= HANDLE_HIT_PX) dragRef.current = 'start';
    else if (Math.abs(x - end * pxPerSec) <= HANDLE_HIT_PX) dragRef.current = 'end';
    else {
      // Undecided until the pointer actually moves: a click seeks, a drag selects.
      dragRef.current = 'pending';
      pendingRef.current = { x, time: timeAt(e.clientX) };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!buffer || !dragRef.current) return;
    const t = timeAt(e.clientX);

    if (dragRef.current === 'pending') {
      const rect = canvasRef.current!.getBoundingClientRect();
      if (Math.abs((e.clientX - rect.left) - pendingRef.current.x) < DRAG_THRESHOLD_PX) return;
      dragRef.current = 'new';
    }

    if (dragRef.current === 'start') setStart(Math.min(t, end - 0.2));
    else if (dragRef.current === 'end') setEnd(Math.max(t, start + 0.2));
    else {
      // A fresh selection spans from where the drag began to the pointer.
      const anchor = pendingRef.current.time;
      setStart(Math.min(anchor, t));
      setEnd(Math.max(anchor, t));
      setCursor(Math.min(anchor, t));
    }
  };

  const onPointerUp = () => {
    // A click with no drag moves the play cursor instead of touching the trim.
    if (dragRef.current === 'pending') {
      const t = pendingRef.current.time;
      setCursor(t);
      if (playing) playFrom(t);
    }
    dragRef.current = null;
  };

  // ---- Waveform painting ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const x0 = (start / buffer.duration) * w;
    const x1 = (end / buffer.duration) * w;

    // Selected region wash
    g.fillStyle = 'rgba(96,165,250,0.10)';
    g.fillRect(x0, 0, x1 - x0, h);

    const barW = w / peaks.length;
    peaks.forEach((peak, i) => {
      const x = i * barW;
      const inRange = x >= x0 && x <= x1;
      const barH = Math.max(1, peak * (h - 10));
      g.fillStyle = inRange ? 'rgba(96,165,250,0.9)' : 'rgba(148,163,184,0.2)';
      g.fillRect(x, (h - barH) / 2, Math.max(0.8, barW - 0.4), barH);
    });

    // Handles
    g.fillStyle = 'rgba(96,165,250,0.95)';
    g.fillRect(x0 - 1.5, 0, 3, h);
    g.fillRect(x1 - 1.5, 0, 3, h);
    [x0, x1].forEach(x => {
      g.beginPath();
      g.roundRect(x - 4, h / 2 - 11, 8, 22, 3);
      g.fill();
    });

    // Play cursor: follows playback when running, otherwise shows where it will start.
    const at = playhead ?? cursor;
    const px = (at / buffer.duration) * w;
    g.fillStyle = playhead !== null ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)';
    g.fillRect(px - 1, 0, 2, h);
    g.beginPath();
    g.moveTo(px - 5, 0);
    g.lineTo(px + 5, 0);
    g.lineTo(px, 6);
    g.closePath();
    g.fill();
  }, [peaks, buffer, start, end, playhead, cursor]);

  return (
    <div className={`audio-panel glass ${open ? '' : 'collapsed'}`}>
      <button className="reference-header" onClick={() => setOpen(o => !o)}>
        <AudioLines className="reference-icon" />
        <div className="reference-title-group">
          <h3 className="panel-title">Audio</h3>
          <span className="reference-subtitle">
            {buffer ? `${sourceName} — ${formatClock(trimmed)} selected` : 'Convert a recording to .m4a or .mp3 and trim it'}
          </span>
        </div>
        <ChevronDown className={`reference-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="reference-body animate-fade-in">
          <div className="audio-actions">
            <button className="btn-secondary" onClick={() => inputRef.current?.click()}>
              {buffer ? 'Choose a different file' : 'Select MP4 / audio file'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/quicktime,audio/*,.mp4,.m4a,.mp3,.wav,.mov"
              style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])}
            />

            <div className="audio-format">
              <span className="export-option-label">Format:</span>
              <div className="segmented-control compact">
                {(['m4a', 'mp3'] as const).map(f => (
                  <button
                    key={f}
                    className={`segment-btn ${format === f ? 'active' : ''}`}
                    onClick={() => onFormatChange(f)}
                  >
                    .{f}
                  </button>
                ))}
              </div>
            </div>

            {status === 'decoding' && <span className="audio-note">Reading audio…</span>}
            {error && <span className="audio-error">{error}</span>}
          </div>

          {buffer && (
            <>
              <canvas
                ref={canvasRef}
                className="audio-wave"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              <div className="audio-scale">
                <span>{formatClock(start)}</span>
                <span className="audio-note">
                  Click to move the play cursor ({formatClock(playhead ?? cursor)}) · drag to select · drag the handles to adjust
                </span>
                <span>{formatClock(end)}</span>
              </div>

              <div className="audio-actions">
                <button className="btn-secondary" onClick={preview}>
                  {playing ? <Pause className="btn-icon-sm" /> : <Play className="btn-icon-sm" />}
                  {playing ? 'Stop' : 'Preview selection'}
                </button>
                <button className="btn-secondary" onClick={() => { setStart(0); setEnd(buffer.duration); setCursor(0); }}>
                  <RotateCcw className="btn-icon-sm" /> Reset trim
                </button>
                <button className="btn-primary" onClick={convert} disabled={status === 'encoding'}>
                  <Scissors className="btn-icon" />
                  {status === 'encoding' ? `Converting ${Math.round(progress * 100)}%` : `Convert to .${format}`}
                </button>
                <span className="audio-note">
                  {formatClock(trimmed)} of {formatClock(buffer.duration)} → {fileName}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
