/**
 * The Finding composer: a markdown textarea with an optional disposition select
 * and submit/cancel. Reused wherever a record is authored from the UI — opening
 * a new Finding, replying (optionally closing the turn with a disposition), or
 * resolving with a reason (data-model.md §5, §7). It owns only draft text; the
 * caller owns what record the submitted body becomes.
 */

import type { Disposition } from "@shared/schemas/finding";
import { useState } from "react";

// The dispositions a reply may carry, plus a "plain comment" no-op default that
// leaves the reply undispositioned (needs-action). Labels track data-model.md §7.
const DISPOSITIONS: { value: Disposition | ""; label: string }[] = [
  { label: "Comment", value: "" },
  { label: "Actioned — needs verify", value: "actioned" },
  { label: "Declined — needs decision", value: "declined" },
  { label: "Question — needs answer", value: "question" },
];

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  padding: "0.5rem",
};

const actionsStyle: React.CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: "0.4rem",
  justifyContent: "flex-end",
};

export function Composer({
  autoFocus,
  busy,
  onCancel,
  onSubmit,
  placeholder,
  requireBody = true,
  submitLabel,
  withDisposition = false,
}: {
  autoFocus?: boolean;
  busy?: boolean;
  onCancel?: () => void;
  onSubmit: (body: string, disposition?: Disposition) => void;
  placeholder: string;
  /** When false, an empty body is allowed (a resolve needs no reason). */
  requireBody?: boolean;
  submitLabel: string;
  withDisposition?: boolean;
}) {
  const [body, setBody] = useState("");
  const [disposition, setDisposition] = useState<Disposition | "">("");

  const canSubmit = !busy && (!requireBody || body.trim() !== "");

  function submit() {
    if (!canSubmit) {
      return;
    }
    onSubmit(body.trim(), disposition === "" ? undefined : disposition);
    setBody("");
    setDisposition("");
  }

  return (
    <div style={formStyle}>
      <textarea
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- selection-driven composer wants the caret
        autoFocus={autoFocus}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={3}
        style={{
          font: "inherit",
          padding: "0.4rem",
          resize: "vertical",
          width: "100%",
        }}
        value={body}
      />
      <div style={actionsStyle}>
        {withDisposition ? (
          <select
            onChange={(event) =>
              setDisposition(event.target.value as Disposition | "")
            }
            style={{ font: "inherit", marginRight: "auto" }}
            value={disposition}
          >
            {DISPOSITIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
        {onCancel ? (
          <button className="expand-context" onClick={onCancel} type="button">
            Cancel
          </button>
        ) : null}
        <button
          className="expand-context"
          disabled={!canSubmit}
          onClick={submit}
          type="button"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
