import type { Doc } from "@aquapro/editor-schema";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { ApiError, api } from "./api";
import type { ComposePayload } from "./api";
import { checkLocalFile } from "./attachments";
import { RichEditor } from "./editor/RichEditor";
import { formatSize } from "./format";
import type { ComposeMode, UploadedFile } from "./types";

export interface ComposeTarget {
  mode: ComposeMode;
  /** The message being answered or forwarded. */
  folder?: string;
  uid?: number;
  /** Continue a saved draft (its uid in the Drafts folder). */
  draftUid?: number;
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

const AUTOSAVE_MS = 15_000;

export function composeHash(target: ComposeTarget): string {
  const params = new URLSearchParams({ mode: target.mode });
  if (target.folder) params.set("folder", target.folder);
  if (target.uid) params.set("uid", String(target.uid));
  if (target.draftUid) params.set("draft", String(target.draftUid));
  return `#/compose?${params.toString()}`;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

const clock = (d: Date) => d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });

export function Compose(props: Props) {
  const { standalone, onClose, onSent } = props;
  const [mode, setMode] = useState<ComposeMode>(props.mode);
  const [origin, setOrigin] = useState<{ folder?: string; uid?: number }>({
    ...(props.folder ? { folder: props.folder } : {}),
    ...(props.uid ? { uid: props.uid } : {}),
  });
  const [draftUid, setDraftUid] = useState<number | undefined>(props.draftUid);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [doc, setDoc] = useState<Doc>([]);
  const [initialDoc, setInitialDoc] = useState<Doc | undefined>();
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(props.mode !== "new" || props.draftUid !== undefined);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [askClose, setAskClose] = useState(false);

  const subjectTouched = useRef(false);
  /** True once the user changed anything. Prefilled reply fields alone do not count. */
  const touched = useRef(false);
  const lastSaved = useRef("");
  const saving = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const touch = () => {
    touched.current = true;
  };

  // ---- load defaults for a reply/forward, or a saved draft
  useEffect(() => {
    let cancelled = false;
    const fail = (e: unknown, fallback: string) =>
      !cancelled && setError(e instanceof ApiError ? e.message : fallback);

    if (props.draftUid !== undefined) {
      api
        .openDraft(props.draftUid)
        .then((d) => {
          if (cancelled) return;
          setMode(d.mode);
          setOrigin({
            ...(d.folder ? { folder: d.folder } : {}),
            ...(d.uid ? { uid: d.uid } : {}),
          });
          setTo(d.to);
          setCc(d.cc);
          setBcc(d.bcc);
          setShowBcc(d.bcc.trim() !== "");
          setSubject(d.subject);
          subjectTouched.current = true;
          setDoc(d.doc);
          setInitialDoc(d.doc);
          setAttachments(d.attachments);
          setDraftUid(d.draftUid);
          lastSaved.current = JSON.stringify({
            mode: d.mode,
            to: d.to,
            cc: d.cc,
            bcc: d.bcc,
            subject: d.subject,
            doc: d.doc,
            ids: d.attachments.map((a) => a.id),
          });
        })
        .catch((e: unknown) => fail(e, "Koncept sa nepodarilo otvoriť."))
        .finally(() => !cancelled && setLoading(false));
    } else if (props.mode !== "new" && props.folder && props.uid) {
      api
        .prepare(props.mode, props.folder, props.uid)
        .then((defaults) => {
          if (cancelled) return;
          setTo(defaults.to);
          setCc(defaults.cc);
          if (!subjectTouched.current) setSubject(defaults.subject);
          setAttachments(defaults.attachments);
        })
        .catch((e: unknown) => fail(e, "Nepodarilo sa načítať správu."))
        .finally(() => !cancelled && setLoading(false));
    }
    return () => {
      cancelled = true;
    };
  }, [props.mode, props.folder, props.uid, props.draftUid]);

  const payload = useCallback(
    (): ComposePayload => ({
      mode,
      ...(origin.folder ? { folder: origin.folder } : {}),
      ...(origin.uid ? { uid: origin.uid } : {}),
      to,
      cc,
      bcc,
      subject,
      doc,
      attachmentIds: attachments.map((a) => a.id),
      ...(draftUid ? { draftUid } : {}),
    }),
    [mode, origin, to, cc, bcc, subject, doc, attachments, draftUid],
  );

  const snapshot = JSON.stringify({
    mode,
    to,
    cc,
    bcc,
    subject,
    doc,
    ids: attachments.map((a) => a.id),
  });
  const hasContent =
    doc.length > 0 ||
    attachments.length > 0 ||
    to.trim() !== "" ||
    cc.trim() !== "" ||
    bcc.trim() !== "" ||
    (mode === "new" && subject.trim() !== "");
  const dirty = touched.current && hasContent && snapshot !== lastSaved.current;

  // ---- saving a draft
  /** Saves the draft. Returns its uid, or undefined when saving failed or is already running. */
  const save = useCallback(async (): Promise<number | undefined> => {
    if (saving.current) return undefined;
    saving.current = true;
    setSaveState({ kind: "saving" });
    try {
      const { uid } = await api.saveDraft(payload());
      if (uid) setDraftUid(uid);
      lastSaved.current = snapshot;
      setSaveState({ kind: "saved", at: new Date() });
      return uid ?? draftUid ?? 0;
    } catch (e) {
      setSaveState({
        kind: "error",
        message: e instanceof ApiError ? e.message : "Koncept sa nepodarilo uložiť.",
      });
      return undefined;
    } finally {
      saving.current = false;
    }
  }, [payload, snapshot, draftUid]);

  const latest = useRef({ save, dirty });
  latest.current = { save, dirty };

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (latest.current.dirty) void latest.current.save();
    }, AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current.dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // ---- closing
  const discard = useCallback(async () => {
    if (draftUid) await api.deleteDraft(draftUid).catch(() => undefined);
    await Promise.all(attachments.map((a) => api.removeUpload(a.id).catch(() => undefined)));
    onClose();
  }, [draftUid, attachments, onClose]);

  const requestClose = useCallback(() => {
    if (busy === "send") return;
    if (!touched.current) return onClose();
    if (!hasContent) return void discard();
    setAskClose(true);
  }, [busy, hasContent, discard, onClose]);

  const saveAndClose = async () => {
    if (!dirty || (await save()) !== undefined) onClose();
    else setAskClose(false);
  };

  const openInNewWindow = async () => {
    let uid = draftUid;
    if (touched.current && hasContent) {
      // The new window continues from a saved draft, so nothing typed so far is lost.
      const saved = dirty ? await save() : (draftUid ?? 0);
      if (saved === undefined) return;
      uid = saved || draftUid;
    }
    const target: ComposeTarget = { mode, ...origin, ...(uid ? { draftUid: uid } : {}) };
    window.open(composeHash(target), "_blank", "popup,width=1040,height=860");
    onClose();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (askClose) setAskClose(false);
      else requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [askClose, requestClose]);

  // ---- attachments
  const addFiles = async (files: FileList | File[]) => {
    setError(null);
    for (const file of Array.from(files)) {
      let current: UploadedFile[] = [];
      setAttachments((list) => (current = list));
      const problem = checkLocalFile(file, current);
      if (problem) {
        setError(problem);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const uploaded = await api.upload(file);
        touch();
        setAttachments((list) => [...list, uploaded]);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Prílohu sa nepodarilo nahrať.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const removeAttachment = (file: UploadedFile) => {
    touch();
    setAttachments((list) => list.filter((a) => a.id !== file.id));
    void api.removeUpload(file.id).catch(() => undefined);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
  };

  // ---- preview and sending
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
      lastSaved.current = snapshot; // nothing left to save: the server removed the draft
      onSent();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Správu sa nepodarilo odoslať.");
      setBusy(null);
    }
  };

  const disabled = busy !== null || loading || uploading > 0;

  const body = (
    <section
      className={standalone ? "compose standalone" : "compose"}
      aria-label={TITLES[mode]}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
      data-dragging={dragging}
    >
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
              disabled={loading}
              onClick={() => void openInNewWindow()}
            >
              Nové okno
            </button>
          )}
          <button type="button" className="ghost" onClick={requestClose}>
            Zavrieť
          </button>
        </div>
      </header>

      {loading ? (
        <p className="empty">Načítavam…</p>
      ) : (
        <div className={tab === "write" ? "compose-body" : "compose-body hidden"}>
          <div className="field">
            <label htmlFor="to">Komu</label>
            <input
              id="to"
              value={to}
              onChange={(e) => (touch(), setTo(e.target.value))}
              autoComplete="off"
            />
            {!showBcc && (
              <button type="button" className="link" onClick={() => setShowBcc(true)}>
                Skrytá kópia
              </button>
            )}
          </div>
          <div className="field">
            <label htmlFor="cc">Kópia</label>
            <input
              id="cc"
              value={cc}
              onChange={(e) => (touch(), setCc(e.target.value))}
              autoComplete="off"
            />
          </div>
          {showBcc && (
            <div className="field">
              <label htmlFor="bcc">Skrytá kópia</label>
              <input
                id="bcc"
                value={bcc}
                onChange={(e) => (touch(), setBcc(e.target.value))}
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
                touch();
                subjectTouched.current = true;
                setSubject(e.target.value);
              }}
              autoComplete="off"
            />
          </div>
          <RichEditor
            initialDoc={initialDoc}
            autoFocus
            onChange={(next) => {
              touch();
              setDoc(next);
            }}
          />
          <div className="attachments-box">
            <div className="attachments-bar">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading > 0}
              >
                Pripojiť súbor
              </button>
              <span className="hint">
                {uploading > 0
                  ? "Nahrávam…"
                  : "alebo súbor pretiahnite do okna (spolu najviac 20 MB)"}
              </span>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                aria-label="Vybrať súbory"
                onChange={(e) => {
                  if (e.target.files?.length) void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {attachments.length > 0 && (
              <ul className="attach-list" aria-label="Prílohy">
                {attachments.map((a) => (
                  <li key={a.id}>
                    <span className="attach-name">{a.filename}</span>
                    <span className="size">{formatSize(a.size)}</span>
                    <button
                      type="button"
                      className="ghost"
                      aria-label={`Odstrániť prílohu ${a.filename}`}
                      onClick={() => removeAttachment(a)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="hint">
            Vzhľad e-mailu (písmo, veľkosť, logo, podpis) určuje systém, nemusíte ho nastavovať.
            {mode !== "new" && " Pôvodná správa sa pridá automaticky."}
          </p>
        </div>
      )}

      {tab === "preview" && preview !== null && (
        <div className="compose-preview">
          <iframe title="Náhľad e-mailu" sandbox="" srcDoc={preview} />
        </div>
      )}

      <footer className="compose-foot">
        <div className="foot-status">
          <div role="alert" className="error">
            {error}
          </div>
          <div className="hint" role="status">
            {saveState.kind === "saving" && "Ukladám koncept…"}
            {saveState.kind === "saved" && `Koncept uložený o ${clock(saveState.at)}`}
            {saveState.kind === "error" && `Koncept sa nepodarilo uložiť: ${saveState.message}`}
          </div>
        </div>
        <button type="button" className="primary" onClick={send} disabled={disabled}>
          {busy === "send" ? "Odosielam…" : "Odoslať"}
        </button>
      </footer>

      {askClose && (
        <div className="confirm-backdrop">
          <div
            className="confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h3 id="confirm-title">Správa nie je odoslaná</h3>
            <p>Čo chcete urobiť s rozpísanou správou?</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="primary"
                autoFocus
                onClick={() => void saveAndClose()}
              >
                Uložiť ako koncept
              </button>
              <button type="button" className="danger" onClick={() => void discard()}>
                Zahodiť
              </button>
              <button type="button" onClick={() => setAskClose(false)}>
                Pokračovať v písaní
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  if (standalone) return body;
  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      {body}
    </div>
  );
}
