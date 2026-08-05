import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { AudioLines, ChevronDown, Play, Pause, Scissors, RotateCcw } from 'lucide-react';
import { decodeAudioFile, encodeAudio, waveformPeaks, formatClock } from '../utils/audio';
import type { AudioFormat } from '../utils/audio';

interface AudioToolProps {
  /** Recording attached on the upload page, loaded automatically when present. */
  initialFile?: File | null;
  format: AudioFormat;
  onFormatChange: (format: AudioFormat) => void;
  /** Hands up an encoder for the current file and trim, or null when no file is loaded. */
  onEncoderChange: (encode: ((onProgress?: (f: number) => void) => Promise<Blob>) | null) => void;
}

const BUCKETS = 700;
type Drag = 'start' | 'end' | 'cursor' | null;

/** mm:ss.s — precise enough to trim on, still readable. */
function preciseClock(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

export function AudioTool({ initialFile, format, onFormatChange, onEncoderChange }: AudioToolProps) {
  const [open, setOpen] = useState(!!initialFile);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [status, setStatus] = useState<'idle' | 'decoding'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<Drag>(null);

  const peaks = useMemo(() => (buffer ? waveformPeaks(buffer, BUCKETS) : []), [buffer]);
  const duration = buffer?.duration ?? 0;
  const trimmed = Math.max(0, end - start);
  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);

  const stopPlayback = useCallback(() => {
    nodeRef.current?.stop();
    nodeRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPlaying(false);
    setPlayhead(null);
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  const loadFile = useCallback(async (file: File) => {
    stopPlayback();
    setError(null);
    setStatus('decoding');
    try {
      const decoded = await decodeAudioFile(file);
      setBuffer(decoded);
      setSourceName(file.name);
      setStart(0);
      setEnd(decoded.duration);
      setCursor(0);
    } catch {
      setError('Could not read audio from that file. Try an .mp4, .mov, .m4a, .mp3 or .wav.');
      setBuffer(null);
    } finally {
      setStatus('idle');
    }
  }, [stopPlayback]);

  // A recording attached on the upload page lands here ready to trim.
  useEffect(() => {
    if (initialFile) loadFile(initialFile);
  }, [initialFile, loadFile]);

  const playFrom = useCallback((from: number) => {
    if (!buffer) return;
    nodeRef.current?.stop();
    nodeRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const begin = Math.min(Math.max(from, 0), Math.max(0, end - 0.05));
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
  }, [buffer, end, stopPlayback]);

  /** Plays from the cursor to the end edge, restarting at the start when spent. */
  const playSelection = () => {
    if (playing) return stopPlayback();
    playFrom(cursor >= end - 0.05 ? start : cursor);
  };

  const resetTrim = () => {
    setStart(0);
    setEnd(duration);
    setCursor(0);
    stopPlayback();
  };

  const onKeys = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      playSelection();
    }
  };

  // Publish an encoder that always reflects the current file, trim and format,
  // so downloading can never hand back a stale clip.
  useEffect(() => {
    if (!buffer) return onEncoderChange(null);
    onEncoderChange((onProgress) => encodeAudio(format, buffer, start, end, onProgress));
  }, [buffer, start, end, format, onEncoderChange]);

  // ---- Dragging: each control owns its own pointer, so nothing is ambiguous ----
  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !duration) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration;
  };

  /** Capture can throw if the pointer is already gone; never let that kill the drag. */
  const capture = (pointerId: number) => {
    try {
      trackRef.current?.setPointerCapture(pointerId);
    } catch {
      // Dragging still works through the track's own handlers.
    }
  };

  const beginDrag = (kind: Drag) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = kind;
    // Capture on the track, which owns the move/up handlers.
    capture(e.pointerId);
  };

  const onTrackMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !buffer) return;
    const t = timeAt(e.clientX);
    if (dragRef.current === 'start') setStart(Math.min(t, end - 0.2));
    else if (dragRef.current === 'end') setEnd(Math.max(t, start + 0.2));
    else setCursor(t);
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  /** Clicking or dragging the wave moves the play cursor and nothing else. The
   *  two edges only move when their own handles are dragged. */
  const seekCursor = (e: React.PointerEvent) => {
    if (!buffer) return;
    setCursor(timeAt(e.clientX));
    if (playing) stopPlayback();
    dragRef.current = 'cursor';
    capture(e.pointerId);
  };

  const nudge = (which: 'start' | 'end', delta: number) => {
    if (which === 'start') setStart(s => Math.max(0, Math.min(s + delta, end - 0.2)));
    else setEnd(en => Math.min(duration, Math.max(en + delta, start + 0.2)));
  };

  // ---- Waveform (bars only; overlays are real elements) ----
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
    const barW = w / peaks.length;
    peaks.forEach((peak, i) => {
      const x = i * barW;
      const inRange = x >= x0 && x <= x1;
      const barH = Math.max(1, peak * (h - 12));
      g.fillStyle = inRange ? 'rgba(96,165,250,0.95)' : 'rgba(148,163,184,0.18)';
      g.fillRect(x, (h - barH) / 2, Math.max(0.8, barW - 0.4), barH);
    });
    // `open` matters: the canvas is unmounted while collapsed, so re-expanding needs a redraw.
  }, [peaks, buffer, start, end, open]);

  return (
    <div className={`audio-panel glass ${open ? '' : 'collapsed'}`}>
      <button className="reference-header" onClick={() => setOpen(o => !o)}>
        <AudioLines className="reference-icon" />
        <div className="reference-title-group">
          <h3 className="panel-title">Audio</h3>
          <span className="reference-subtitle">
            {buffer
              ? `${sourceName}, ${formatClock(trimmed)} selected`
              : 'Trim the recording and save it as .m4a or .mp3'}
          </span>
        </div>
        <ChevronDown className={`reference-chevron ${open ? 'open' : ''}`} />
      </button>

      {open && (
        <div className="reference-body animate-fade-in">
          <div className="audio-actions">
            <button className="btn-secondary" onClick={() => inputRef.current?.click()}>
              {buffer ? 'Choose a different file' : 'Select video or audio file'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="video/*,audio/*,.mp4,.mov,.m4v,.webm,.m4a,.mp3,.wav,.aac,.ogg"
              style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])}
            />
            <div className="audio-format">
              <span className="export-option-label">Format:</span>
              <div className="segmented-control compact">
                {(['m4a', 'mp3'] as const).map(f => (
                  <button key={f} className={`segment-btn ${format === f ? 'active' : ''}`} onClick={() => onFormatChange(f)}>
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
              <div className="audio-transport">
                <button className="btn-primary transport-play" onClick={playSelection}>
                  {playing ? <Pause className="btn-icon" /> : <Play className="btn-icon" />}
                  {playing ? 'Pause' : 'Play'}
                </button>
                <span className="transport-time">{preciseClock(playhead ?? cursor)}</span>
                <span className="transport-keep">
                  <Scissors className="btn-icon-sm" />
                  Keeping <strong>{formatClock(trimmed)}</strong> of {formatClock(duration)}
                </span>
                <button className="btn-secondary" onClick={resetTrim}>
                  <RotateCcw className="btn-icon-sm" /> Reset
                </button>
              </div>

              <div
                className="audio-track"
                ref={trackRef}
                tabIndex={0}
                onKeyDown={onKeys}
                onPointerMove={onTrackMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <canvas ref={canvasRef} className="audio-wave" onPointerDown={seekCursor} />

                {/* Everything outside the selection is dimmed */}
                <div className="audio-dim" style={{ left: 0, width: `${pct(start)}%` }} />
                <div className="audio-dim" style={{ left: `${pct(end)}%`, right: 0 }} />

                <div className="audio-cursor" style={{ left: `${pct(playhead ?? cursor)}%` }}>
                  <span className="audio-cursor-grip" />
                </div>

                <div
                  className="audio-handle start"
                  style={{ left: `${pct(start)}%` }}
                  onPointerDown={beginDrag('start')}
                  title="Drag to move the start"
                >
                  <span className="audio-handle-bar" />
                </div>
                <div
                  className="audio-handle end"
                  style={{ left: `${pct(end)}%` }}
                  onPointerDown={beginDrag('end')}
                  title="Drag to move the end"
                >
                  <span className="audio-handle-bar" />
                </div>
              </div>

              <p className="trim-help">
                Click anywhere on the wave to listen from there. Drag the two blue edges to set what
                you keep: the lit part is what gets saved. Space plays and pauses.
              </p>

              <div className="trim-rows">
                <div className="trim-side">
                  <span className="field-label">Starts at</span>
                  <span className="trim-time">{preciseClock(start)}</span>
                  <button className="btn-secondary" onClick={() => nudge('start', -1)} title="One second earlier">−1s</button>
                  <button className="btn-secondary" onClick={() => nudge('start', 1)} title="One second later">+1s</button>
                </div>
                <div className="trim-side">
                  <span className="field-label">Ends at</span>
                  <span className="trim-time">{preciseClock(end)}</span>
                  <button className="btn-secondary" onClick={() => nudge('end', -1)} title="One second earlier">−1s</button>
                  <button className="btn-secondary" onClick={() => nudge('end', 1)} title="One second later">+1s</button>
                </div>
              </div>

              <p className="audio-note">When you download the files, it applies the cut.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
