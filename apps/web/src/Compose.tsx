import type { Doc } from "@aquapro/editor-schema";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "./api";
import type { ComposePayload } from "./api";
import { RichEditor } from "./editor/RichEditor";
import type { ComposeMode } from "./types";

export interface ComposeTarget {
  mode: ComposeMode;
  folder?: string;
  uid?: number;
}

interface Props extends ComposeTarget {
  standalone?: boolean;
  onClose: () => void;
  onSent: () => void;
}

const TITLES: Record<ComposeMode, string> = {
  new: "Nová správa",
  reply: "Odpoveď",
  replyAll: "Odpoveď všetkým",
  forward: "Preposlanie",
};

export function composeHash(target: ComposeTarget): string {
  const params = new URLSearchParams({ mode: target.mode });
  if (target.folder) params.set("folder", target.folder);
  if (target.uid) params.set("uid", String(target.uid));
  return `#/compose?${params.toString()}`;
}

export function Compose({ mode, folder, uid, standalone, onClose, onSent }: Props) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [doc, setDoc] = useState<Doc>([]);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"loading" | "preview" | "send" | null>(
    mode === "new" ? null : "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const subjectTouched = useRef(false);

  useEffect(() => {
    if (mode === "new" || !folder || !uid) return;
    let cancelled = false;
    api
      .prepare(mode, folder, uid)
      .then((defaults) => {
        if (cancelled) return;
        setTo(defaults.to);
        setCc(defaults.cc);
        if (!subjectTouched.current) setSubject(defaults.subject);
      })
      .catch(
        (e: unknown) =>
          !cancelled &&
          setError(e instanceof ApiError ? e.message : "Nepodarilo sa načítať správu."),
      )
      .finally(() => !cancelled && setBusy(null));
    return () => {
      cancelled = true;
    };
  }, [mode, folder, uid]);

  const payload = (): ComposePayload => ({
    mode,
    ...(folder ? { folder } : {}),
    ...(uid ? { uid } : {}),
    to,
    cc,
    bcc,
    subject,
    doc,
  });

  const showPreview = async () => {
    setError(null);
    setBusy("preview");
    try {
      const result = await api.preview(payload());
      setPreview(result.html);
      setTab("preview");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Náhľad sa nepodarilo vytvoriť.");
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setError(null);
    setBusy("send");
    try {
      await api.send(payload());
      onSent();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Správu sa nepodarilo odoslať.");
      setBusy(null);
    }
  };

  const disabled = busy !== null;

  return (
    <section className={standalone ? "compose standalone" : "compose"} aria-label={TITLES[mode]}>
      <header className="compose-head">
        <h2>{TITLES[mode]}</h2>
        <div className="segmented" role="tablist" aria-label="Zobrazenie">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "write"}
            onClick={() => setTab("write")}
          >
            Písať
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "preview"}
            onClick={showPreview}
            disabled={disabled}
          >
            Náhľad e-mailu
          </button>
        </div>
        <div className="compose-actions">
          {!standalone && (
            <button
              type="button"
              className="ghost"
              title="Otvoriť v samostatnom okne (napr. na druhom monitore)"
              onClick={() => {
                window.open(
                  composeHash({ mode, ...(folder ? { folder } : {}), ...(uid ? { uid } : {}) }),
                  "_blank",
                  "popup,width=1040,height=860",
                );
                onClose();
              }}
            >
              Nové okno
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            Zavrieť
          </button>
        </div>
      </header>

      <div className={tab === "write" ? "compose-body" : "compose-body hidden"}>
        <div className="field">
          <label htmlFor="to">Komu</label>
          <input id="to" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" />
          {!showBcc && (
            <button type="button" className="link" onClick={() => setShowBcc(true)}>
              Skrytá kópia
            </button>
          )}
        </div>
        <div className="field">
          <label htmlFor="cc">Kópia</label>
          <input id="cc" value={cc} onChange={(e) => setCc(e.target.value)} autoComplete="off" />
        </div>
        {showBcc && (
          <div className="field">
            <label htmlFor="bcc">Skrytá kópia</label>
            <input
              id="bcc"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="subject">Predmet</label>
          <input
            id="subject"
            value={subject}
            onChange={(e) => {
              subjectTouched.current = true;
              setSubject(e.target.value);
            }}
            autoComplete="off"
          />
        </div>
        <RichEditor onChange={setDoc} autoFocus />
        <p className="hint">
          Vzhľad e-mailu (písmo, veľkosť, logo, podpis) určuje systém, nemusíte ho nastavovať.
          {mode !== "new" && " Pôvodná správa sa pridá automaticky."}
        </p>
      </div>

      {tab === "preview" && preview !== null && (
        <div className="compose-preview">
          <iframe title="Náhľad e-mailu" sandbox="" srcDoc={preview} />
        </div>
      )}

      <footer className="compose-foot">
        <div role="alert" className="error">
          {error}
        </div>
        <button type="button" className="primary" onClick={send} disabled={disabled}>
          {busy === "send" ? "Odosielam…" : "Odoslať"}
        </button>
      </footer>
    </section>
  );
}
