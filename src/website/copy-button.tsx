import { Button } from "@client/components/ui/button";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

const COPIED_RESET_MS = 2000;

export function CopyButton({
  className,
  label,
  text,
}: {
  className?: string;
  label: string;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = setTimeout(() => setCopied(false), COPIED_RESET_MS);

    return () => clearTimeout(timeout);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button
      aria-label={label}
      className={className}
      onClick={() => void copy()}
      size="icon"
      variant="ghost"
    >
      {copied ? <Check /> : <Copy />}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </Button>
  );
}
