import { useEffect, useRef, useState } from "react";
import type { Profile } from "./types";

interface Props {
  user: Profile;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
}

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

function ThemeIcon({ theme }: { theme: "light" | "dark" }) {
  // Shows what a click switches TO: a moon in the light theme, a sun in the dark one.
  return theme === "light" ? (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
    </svg>
  );
}

/** Bar above the message list and reader: theme switch and the signed-in user with their menu. */
export function TopBar({ user, theme, onToggleTheme, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
      } else if (wrapper.current && !wrapper.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <header className="topbar">
      <div className="topbar-spacer" />
      <button
        type="button"
        className="icon-button"
        onClick={onToggleTheme}
        aria-label={theme === "dark" ? "Prepnúť na svetlú tému" : "Prepnúť na tmavú tému"}
        title={theme === "dark" ? "Svetlá téma" : "Tmavá téma"}
      >
        <ThemeIcon theme={theme} />
      </button>
      <div className="user-menu" ref={wrapper}>
        <button
          type="button"
          className="user-button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Účet: ${user.name}`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="avatar" aria-hidden="true">
            {initials(user.name)}
          </span>
          <span className="user-name">{user.name}</span>
          <span className="chevron" aria-hidden="true">
            ▾
          </span>
        </button>
        {open && (
          <div className="menu" role="menu">
            <div className="menu-head">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            <button type="button" role="menuitem" className="menu-item" onClick={onLogout}>
              Odhlásiť
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
