import { Image } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "../ui/empty";

/** Shown while the reader is in a stretch of prose that places no capture. */
export function ProductEmpty() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Image />
        </EmptyMedia>
        <EmptyDescription>
          No capture for this part of the tour.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
