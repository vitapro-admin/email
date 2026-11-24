import { useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { Compose } from "./Compose";
import type { ComposeMode } from "./types";
import { Login } from "./Login";
import { MailApp } from "./MailApp";
import type { Me } from "./types";
import { Admin } from "./admin/Admin";
import { Tasks } from "./Tasks";

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
  const draftUid = Number(params.get("draft")) || undefined;
  return {
    mode,
    ...(folder ? { folder } : {}),
    ...(uid ? { uid } : {}),
    ...(draftUid ? { draftUid } : {}),
  };
}

export function App() {
  const [me, setMe] = useState<Me | null | "loading">("loading");
  const [adminOpen, setAdminOpen] = useState(() => window.location.hash === "#/admin");
  const [tasksOpen, setTasksOpen] = useState(() => window.location.hash === "#/tasks");
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
      .then((r) => setMe(r))
      .catch((e: unknown) => {
        if (!(e instanceof ApiError) || e.status !== 401) console.error(e);
        setMe(null);
      });
  }, []);

  useEffect(() => {
    const onHash = () => {
      setStandalone(parseComposeHash(window.location.hash));
      setAdminOpen(window.location.hash === "#/admin");
      setTasksOpen(window.location.hash === "#/tasks");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (me === "loading") return <p className="empty">Načítavam…</p>;
  if (me === null) return <Login onLoggedIn={setMe} />;

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

  const canAdmin = me.permissions.some((x) => x === "users:view" || x === "users:manage");
  const openAdmin = () => {
    window.location.hash = "#/admin";
  };
  const closeAdmin = () => {
    window.location.hash = "";
  };
  const canTasks = me.permissions.some((x) => x.startsWith("tasks:"));
  const openTasks = () => {
    window.location.hash = "#/tasks";
  };
  const showTasks = tasksOpen && canTasks && !adminOpen;
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const logout = () => {
    void api.logout().finally(() => {
      window.location.hash = "";
      setMe(null);
    });
  };

  return (
    <>
      <div hidden={(adminOpen && canAdmin) || showTasks} className="app-host">
        <MailApp
          user={me.user}
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogout={logout}
          {...(canAdmin ? { onOpenAdmin: openAdmin } : {})}
          {...(canTasks ? { onOpenTasks: openTasks } : {})}
        />
      </div>
      {showTasks && (
        <Tasks
          me={me}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenMail={closeAdmin}
          onLogout={logout}
          {...(canAdmin ? { onOpenAdmin: openAdmin } : {})}
        />
      )}
      {adminOpen && canAdmin && (
        <Admin
          me={me}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          onBack={closeAdmin}
          onLogout={logout}
        />
      )}
    </>
  );
}
