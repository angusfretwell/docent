import { Pane } from "@client/components/pane";
import { Badge } from "@client/components/ui/badge";
import { Button } from "@client/components/ui/button";
import { Group, GroupSeparator } from "@client/components/ui/group";
import type { Capture } from "@shared/schemas/walkthrough";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import prettyMilliseconds from "pretty-ms";
import type { ReactNode } from "react";

/**
 * How the panel names the capture it holds, and how the reader steps off it.
 * Stepping is the tour's own jump — the handlers scroll the prose — so a
 * neighbour the tour can't reach arrives as `undefined` and disables its arrow.
 */
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

/**
 * The card the capture is read in: the caption naming what is on the stage, and
 * the dotted field it is staged on. Both belong to the panel rather than to any
 * one capture, so they are rendered once around whichever captures the panel is
 * holding — stepping from one to the next moves only what is on the stage, and
 * the frame around it never blinks.
 *
 * Captures are placed into `children` as siblings filling the stage, which is
 * what lets one dissolve into another over a field that never moves.
 */
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
