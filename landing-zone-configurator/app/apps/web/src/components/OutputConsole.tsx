import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
export function OutputConsole({
  text,
  running,
  label,
}: {
  text: string;
  running: boolean;
  label: string;
}) {
  const [follow, setFollow] = useState(true);
  const consoleRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (text && follow && running && consoleRef.current)
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [text, follow, running]);
  return (
    <>
      {running && (
        <label className="field-hint">
          <input
            type="checkbox"
            checked={follow}
            onChange={(event) => setFollow(event.target.checked)}
          />{" "}
          {t("Ausgabe folgen")}
        </label>
      )}
      <textarea
        ref={consoleRef}
        className="plan-console"
        readOnly
        rows={22}
        value={text}
        aria-label={t(label)}
        onScroll={(event) => {
          const e = event.currentTarget;
          setFollow(e.scrollHeight - e.scrollTop - e.clientHeight <= 32);
        }}
      />
    </>
  );
}
