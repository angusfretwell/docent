import { Pane } from "@client/components/pane";
import { Badge } from "@client/components/ui/badge";
import { Button } from "@client/components/ui/button";
import { Group, GroupSeparator } from "@client/components/ui/group";
import type { Capture } from "@shared/schemas/walkthrough";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import prettyMilliseconds from "pretty-ms";
import type { ReactNode } from "react";

interface CaptionProps {
  label: string;
  onNext?: () => void;
  onPrevious?: () => void;
}

function CaptureCaption({
  capture,
  label,
  onNext,
  onPrevious,
}: { capture: Capture } & CaptionProps) {
  const duration = capture.durationMs ?? 0;

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <Group>
        <Button
          aria-label="Previous capture"
          disabled={onPrevious === undefined}
          onClick={onPrevious}
          size="icon-xs"
          variant="outline"
        >
          <ChevronUp />
        </Button>
        <GroupSeparator />
        <Button
          aria-label="Next capture"
          disabled={onNext === undefined}
          onClick={onNext}
          size="icon-xs"
          variant="outline"
        >
          <ChevronDown />
        </Button>
      </Group>

      <span className="shrink-0 flex items-center gap-1.5 text-sm tabular-nums">
        <span>{label}</span>
        {capture.kind === "recording" && duration > 0
          ? ` · ${prettyMilliseconds(duration, { secondsDecimalDigits: 1 })}`
          : ""}
      </span>

      <Badge variant="secondary" className="font-mono ml-auto">
        <Globe />
        {capture.route}
      </Badge>
    </div>
  );
}

export function CaptureFrame({
  capture,
  children,
  ...caption
}: { capture: Capture; children: ReactNode } & CaptionProps) {
  return (
    <Pane>
      <CaptureCaption capture={capture} {...caption} />

      <div className="bg-size-[16px_16px] bg-[radial-gradient(--alpha(var(--color-foreground)/16%)_1px,transparent_1px)] relative min-h-0 flex-1">
        {children}
      </div>
    </Pane>
  );
}
