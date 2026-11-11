import { type ReactNode, useEffect, useId, useRef } from "react";
import { t } from "../i18n";

export function PeopleDialog({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const headingId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="people-dialog"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="people-dialog-heading">
        <h2 id={headingId}>{title}</h2>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={onClose}
          aria-label={t("Schließen")}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
