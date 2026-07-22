import { IconEmpty } from "@client/components/icon-empty";
import { Image } from "lucide-react";

/** Shown while the reader is in a stretch of prose that places no capture. */
export function ProductEmpty() {
  return (
    <IconEmpty icon={<Image />}>
      No capture for this part of the tour.
    </IconEmpty>
  );
}
