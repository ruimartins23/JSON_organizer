import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

export type Theme = 'light' | 'dark' | 'system';

// Kept in step with the pre-paint script in index.html.
const KEY = 'ai-json-organizer:theme';

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'Match system', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // Private mode. Fall through to following the system.
  }
  return 'system';
}

function apply(theme: Theme) {
  const resolved =
    theme === 'system'
      ? matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

/**
 * "System" is resolved here rather than in CSS. That costs a matchMedia listener
 * but buys a single set of light tokens: a prefers-color-scheme copy is a second
 * place to add a token to, and the one that gets forgotten.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(stored);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Not worth failing over.
    }

    // Only while following the system does the OS flipping at dusk mean anything.
    if (theme !== 'system') return;
    const query = matchMedia('(prefers-color-scheme: light)');
    const onChange = () => apply('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);

  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          className={`theme-btn ${theme === value ? 'active' : ''}`}
          onClick={() => setTheme(value)}
          title={label}
          aria-label={label}
          aria-pressed={theme === value}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
