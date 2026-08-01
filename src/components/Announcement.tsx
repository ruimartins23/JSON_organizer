import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';

// Bump this key when a new announcement should re-appear for everyone.
const STORAGE_KEY = 'ai-json-organizer:announcement:recording-upload-v1';

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
          Hey guys! You can now drop the recording in right here on this page, next to the JSON.
          It carries over to the Audio panel already loaded, so you just trim it and hit Download All.
          It is optional though: leave it empty, upload the JSON on its own, and you can still add
          the recording later on the next page. Much love, Rui 💙
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
