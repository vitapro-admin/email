interface Props {
  current: "mail" | "tasks";
  onOpenMail: () => void;
  /** Undefined when the person may not see tasks. */
  onOpenTasks?: () => void;
}

/** Switch between the modules under the logo. Hidden when there is only one module to show. */
export function ModuleNav({ current, onOpenMail, onOpenTasks }: Props) {
  if (!onOpenTasks) return null;
  return (
    <div className="module-nav" role="tablist" aria-label="Modul">
      <button
        type="button"
        role="tab"
        aria-selected={current === "mail"}
        onClick={current === "mail" ? undefined : onOpenMail}
      >
        Pošta
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={current === "tasks"}
        onClick={current === "tasks" ? undefined : onOpenTasks}
      >
        Úlohy
      </button>
    </div>
  );
}
