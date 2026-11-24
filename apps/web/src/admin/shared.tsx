import { ApiError } from "../api";

export const errorText = (e: unknown, fallback = "Niečo sa pokazilo. Skúste to znova."): string =>
  e instanceof ApiError ? e.message : fallback;

/** Roles only a superadmin may hand out. */
export const PRIVILEGED = ["superadmin", "admin"];

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="Zavrieť okno" onClick={onClose}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("sk-SK", { dateStyle: "short", timeStyle: "medium" });
