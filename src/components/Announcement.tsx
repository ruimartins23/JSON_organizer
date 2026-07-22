import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';

// Bump this key when a new announcement should re-appear for everyone.
const STORAGE_KEY = 'ai-json-organizer:announcement:inline-review-v1';

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
          Hey guys! You can now mark each function and transfer as{' '}
          <strong className="announcement-ok">correct</strong> or{' '}
          <strong className="announcement-bad">incorrect</strong> right in the timeline.
          Just hit the ✓ or ✗ next to the call. The Function &amp; Transfer Summary updates
          itself so you can copy it straight out. Much love, Rui 💙
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
