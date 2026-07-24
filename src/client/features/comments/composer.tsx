import { Button } from "@client/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@client/components/ui/input-group";
import { useEffect, useRef, useState } from "react";

export function Composer({
  busy = false,
  cancelOnBlur = true,
  label = "Comment",
  onCancel,
  onSubmit,
  placeholder = "Write a comment…",
  requireBody = true,
}: {
  busy?: boolean;
  cancelOnBlur?: boolean;
  label?: string;
  onCancel?: () => void;
  onSubmit: (body: string) => void;
  placeholder?: string;
  requireBody?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");

  const body = value.trim();
  const canSubmit = !busy && (!requireBody || body !== "");

  function submit() {
    if (!canSubmit) {
      return;
    }

    onSubmit(body);
    setValue("");
  }

  useEffect(() => {
    ref.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, []);

  return (
    <InputGroup>
      <InputGroupTextarea
        ref={ref}
        aria-label={placeholder}
        autoFocus={true}
        placeholder={placeholder}
        className="*:data-[slot=textarea]:min-h-0! *:data-[slot=textarea]:scroll-my-13"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (body === "" && cancelOnBlur) {
            onCancel?.();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && body === "") {
            onCancel?.();
            return;
          }

          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />

      <InputGroupAddon align="block-end" className="justify-end">
        {onCancel && (
          <Button onClick={onCancel} size="sm" variant="ghost">
            Cancel
          </Button>
        )}

        <Button disabled={!canSubmit} loading={busy} onClick={submit} size="sm">
          {label}
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );
}
