/**
 * The Finding composer: a markdown textarea with an optional disposition select
 * and submit/cancel. Reused wherever a record is authored from the UI — opening
 * a new Finding, replying (optionally closing the turn with a disposition), or
 * resolving with a reason (data-model.md §5, §7). It owns only draft text; the
 * caller owns what record the submitted body becomes.
 */

import { Button } from "@client/ui/button";
import { Field, FieldLabel } from "@client/ui/field";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@client/ui/select";
import { Textarea } from "@client/ui/textarea";
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
    <div className="flex flex-col gap-1.5 p-2">
      <Field>
        <FieldLabel className="sr-only">{placeholder}</FieldLabel>
        <Textarea
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
          size="sm"
          value={body}
        />
      </Field>
      <div className="flex items-center justify-end gap-1.5">
        {withDisposition ? (
          <Select
            items={DISPOSITIONS}
            onValueChange={(value) => setDisposition(value ?? "")}
            value={disposition}
          >
            <SelectTrigger className="me-auto w-fit" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {DISPOSITIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        ) : null}
        {onCancel ? (
          <Button onClick={onCancel} size="sm" variant="ghost">
            Cancel
          </Button>
        ) : null}
        <Button disabled={!canSubmit} loading={busy} onClick={submit} size="sm">
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
