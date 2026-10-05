import type { ReactNode } from "react";
import { t } from "../i18n";

export function Field({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string;
  type?: "text" | "email";
  children?: ReactNode;
}) {
  const shared = {
    id,
    value,
    "aria-invalid": !!error,
    "aria-describedby":
      [hint && `${id}-hint`, error && `${id}-error`]
        .filter(Boolean)
        .join(" ") || undefined,
  };
  return (
    <div className="field">
      <label htmlFor={id}>
        {t(label)} <span aria-hidden="true">*</span>
      </label>
      {children ? (
        <select {...shared} onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
      ) : (
        <input
          {...shared}
          type={type}
          required
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {t(hint)}
        </p>
      )}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}
