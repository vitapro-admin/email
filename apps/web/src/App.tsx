import { useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { Compose } from "./Compose";
import type { ComposeMode } from "./types";
import { Login } from "./Login";
import { MailApp } from "./MailApp";
import type { Profile } from "./types";

type Theme = "light" | "dark";

function readTheme(): Theme {
  try {
    return localStorage.getItem("aq-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** #/compose?mode=reply&folder=INBOX&uid=3 opens the compose view alone (used for a second window). */
function parseComposeHash(
  hash: string,
): { mode: ComposeMode; folder?: string; uid?: number } | null {
  if (!hash.startsWith("#/compose")) return null;
  const params = new URLSearchParams(hash.split("?")[1] ?? "");
  const mode = params.get("mode");
  if (mode !== "new" && mode !== "reply" && mode !== "replyAll" && mode !== "forward") return null;
  const folder = params.get("folder") ?? undefined;
  const uid = Number(params.get("uid")) || undefined;
  return { mode, ...(folder ? { folder } : {}), ...(uid ? { uid } : {}) };
}

export function App() {
  const [user, setUser] = useState<Profile | null | "loading">("loading");
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [standalone, setStandalone] = useState(() => parseComposeHash(window.location.hash));

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
    try {
      localStorage.setItem("aq-theme", theme);
    } catch {
      /* storage unavailable: the theme just is not remembered */
    }
  }, [theme]);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch((e: unknown) => {
        if (!(e instanceof ApiError) || e.status !== 401) console.error(e);
        setUser(null);
      });
  }, []);

  useEffect(() => {
    const onHash = () => setStandalone(parseComposeHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (user === "loading") return <p className="empty">Načítavam…</p>;
  if (user === null) return <Login onLoggedIn={setUser} />;

  if (standalone) {
    const done = () => {
      try {
        const channel = new BroadcastChannel("aq-mail");
        channel.postMessage({ type: "sent" });
        channel.close();
      } catch {
        /* ignore */
      }
      window.close();
    };
    return (
      <div className="standalone-wrap">
        <Compose {...standalone} standalone onClose={() => window.close()} onSent={done} />
      </div>
    );
  }

  return (
    <MailApp
      user={user}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      onLogout={() => {
        void api.logout().finally(() => setUser(null));
      }}
    />
  );
}
