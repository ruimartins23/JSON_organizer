import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';

// Bump this key when a new announcement should re-appear for everyone.
const STORAGE_KEY = 'ai-json-organizer:announcement:call-recording-v1';

export function Announcement() {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'dismissed';
    } catch {
      return true;
    }
  });

  if (!visible) return null;

  const dismissForever = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'dismissed');
    } catch {
      // ignore storage failures (private mode, etc.)
    }
    setVisible(false);
  };

  return (
    <div className="announcement glass animate-fade-in">
      <div className="announcement-icon">
        <Sparkles />
      </div>
      <div className="announcement-body">
        <h3 className="announcement-title">Quick update</h3>
        <p>
          Hey guys! You can stop using OBS. Open the Audio panel, hit <strong>Record the call</strong>,
          and it grabs your mic and the agent voice at the same time and drops it straight into the
          trimmer. There are volume sliders for both if one side is too loud.
        </p>
        <p>
          One thing, and it matters: when Chrome asks what to share, pick{' '}
          <strong>the agent tab</strong> and turn the audio toggle on. Skip that and you record only
          yourself. The steps are written next to the button.
        </p>
        <p>
          This only works on <strong>Chrome and Edge</strong>. Firefox and Safari cannot record tab
          audio at all, so on those you still record with OBS like before and load the file yourself,
          either on the upload page next to the JSON or in the Audio panel. Same if you already have
          a file lying around. Much love, Rui 💙
        </p>
        <div className="announcement-actions">
          <button className="btn-secondary" onClick={dismissForever}>
            Never show again
          </button>
        </div>
      </div>
      <button className="announcement-close" title="Dismiss" onClick={() => setVisible(false)}>
        <X />
      </button>
    </div>
  );
}
