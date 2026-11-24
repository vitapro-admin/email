import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { TopBar } from "./TopBar";
import { ApiError, api } from "./api";
import { Compose } from "./Compose";
import type { ComposeTarget } from "./Compose";
import { folderLabel, formatFull, formatShort, formatSize, personFull, personName } from "./format";
import type { Folder, MessageSummary, MessageView, Profile } from "./types";

interface Props {
  user: Profile;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
}

export function MailApp({ user, theme, onToggleTheme, onLogout }: Props) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState("INBOX");
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<MessageView | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [images, setImages] = useState(false);
  const [compose, setCompose] = useState<ComposeTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const folderRef = useRef(folder);
  folderRef.current = folder;

  const refresh = useCallback(async () => {
    try {
      const [f, m] = await Promise.all([api.folders(), api.messages(folderRef.current)]);
      setFolders(f);
      setMessages(m);
      setListError(null);
    } catch (e) {
      setListError(e instanceof ApiError ? e.message : "Nepodarilo sa načítať poštu.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [folder, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 60_000);
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel("aq-mail");
      channel.onmessage = () => void refresh();
    } catch {
      /* not supported: the timer still refreshes */
    }
    return () => {
      window.clearInterval(timer);
      channel?.close();
    };
  }, [refresh]);

  useEffect(() => {
    if (selected === null) {
      setView(null);
      return;
    }
    let cancelled = false;
    setViewError(null);
    api
      .message(folder, selected, images)
      .then((v) => {
        if (cancelled) return;
        setView(v);
        setMessages((list) => list.map((m) => (m.uid === v.uid ? { ...m, seen: true } : m)));
        void api
          .folders()
          .then((f) => !cancelled && setFolders(f))
          .catch(() => undefined);
      })
      .catch(
        (e: unknown) =>
          !cancelled &&
          setViewError(e instanceof ApiError ? e.message : "Správu sa nepodarilo otvoriť."),
      );
    return () => {
      cancelled = true;
    };
  }, [folder, selected, images]);

  const openFolder = (path: string) => {
    setFolder(path);
    setSelected(null);
    setImages(false);
  };

  const openMessage = (uid: number) => {
    setSelected(uid);
    setImages(false);
  };

  const startCompose = (mode: ComposeTarget["mode"]) => {
    if (mode === "new") setCompose({ mode });
    else if (selected !== null) setCompose({ mode, folder, uid: selected });
  };

  const sent = () => {
    setCompose(null);
    setNotice("Správa bola odoslaná.");
    window.setTimeout(() => setNotice(null), 4000);
    try {
      const channel = new BroadcastChannel("aq-mail");
      channel.postMessage({ type: "sent" });
      channel.close();
    } catch {
      /* ignore */
    }
    void refresh();
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <Logo className="sidebar-logo" />
        <button type="button" className="primary wide" onClick={() => startCompose("new")}>
          Nová správa
        </button>
        <nav aria-label="Priečinky">
          {folders.map((f) => (
            <button
              key={f.path}
              type="button"
              className="folder"
              aria-current={f.path === folder ? "page" : undefined}
              onClick={() => openFolder(f.path)}
            >
              <span>{folderLabel(f)}</span>
              {f.unseen > 0 && <span className="count">{f.unseen}</span>}
            </button>
          ))}
        </nav>
      </aside>

      <div className="main">
        <TopBar user={user} theme={theme} onToggleTheme={onToggleTheme} onLogout={onLogout} />
        <div className="content">
          <section className="list" aria-label="Správy">
            {listError && (
              <div role="alert" className="error pad">
                {listError}
              </div>
            )}
            {messages.length === 0 && !listError && <p className="empty">Žiadne správy.</p>}
            <ul>
              {messages.map((m) => (
                <li key={m.uid}>
                  <button
                    type="button"
                    className={`row${m.seen ? "" : " unread"}`}
                    aria-current={m.uid === selected ? "true" : undefined}
                    onClick={() => openMessage(m.uid)}
                  >
                    <span className="row-top">
                      <span className="row-from">{personName(m.from)}</span>
                      <span className="row-date">{formatShort(m.date)}</span>
                    </span>
                    <span className="row-subject">
                      {m.subject || "(bez predmetu)"}
                      {m.hasAttachments && (
                        <span className="clip" title="Má prílohu">
                          {" "}
                          📎
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="reader" aria-label="Čítanie správy">
            {notice && (
              <div role="status" className="notice">
                {notice}
              </div>
            )}
            {viewError && (
              <div role="alert" className="error pad">
                {viewError}
              </div>
            )}
            {!view && !viewError && <p className="empty">Vyberte správu zo zoznamu.</p>}
            {view && (
              <>
                <header className="reader-head">
                  <h2>{view.subject || "(bez predmetu)"}</h2>
                  <dl className="meta">
                    <dt>Od</dt>
                    <dd>{personFull(view.from)}</dd>
                    <dt>Komu</dt>
                    <dd>{view.to.map(personFull).join(", ")}</dd>
                    {view.cc.length > 0 && (
                      <>
                        <dt>Kópia</dt>
                        <dd>{view.cc.map(personFull).join(", ")}</dd>
                      </>
                    )}
                    <dt>Dátum</dt>
                    <dd>{formatFull(view.date)}</dd>
                  </dl>
                  <div className="reader-actions">
                    <button type="button" onClick={() => startCompose("reply")}>
                      Odpovedať
                    </button>
                    <button type="button" onClick={() => startCompose("replyAll")}>
                      Odpovedať všetkým
                    </button>
                    <button type="button" onClick={() => startCompose("forward")}>
                      Preposlať
                    </button>
                  </div>
                  {view.safety.suspiciousLinks > 0 && (
                    <div className="banner warn" role="alert">
                      Pozor: správa obsahuje odkaz, ktorý sa tvári ako iná webová adresa, než kam
                      skutočne vedie. Neklikajte naň, kým si nie ste istí odosielateľom.
                    </div>
                  )}
                  {view.safety.blockedRemoteImages > 0 && !view.safety.remoteImagesAllowed && (
                    <div className="banner">
                      Obrázky z internetu sú zablokované ({view.safety.blockedRemoteImages}), aby
                      odosielateľ nezistil, že ste správu otvorili.{" "}
                      <button type="button" className="link" onClick={() => setImages(true)}>
                        Zobraziť obrázky
                      </button>
                    </div>
                  )}
                  {view.attachments.length > 0 && (
                    <ul className="attachments" aria-label="Prílohy">
                      {view.attachments.map((a) => (
                        <li key={a.index}>
                          <a href={api.attachmentUrl(view.folder, view.uid, a.index)} download>
                            {a.filename}
                          </a>{" "}
                          <span className="size">{formatSize(a.size)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </header>
                <iframe
                  className="message-frame"
                  title="Obsah správy"
                  sandbox={view.frame.sandbox}
                  srcDoc={view.frame.document}
                />
              </>
            )}
          </section>
        </div>
      </div>

      {compose && (
        <div className="overlay">
          <Compose {...compose} onClose={() => setCompose(null)} onSent={sent} />
        </div>
      )}
    </div>
  );
}
