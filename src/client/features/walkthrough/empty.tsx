import { IconEmpty } from "@client/components/icon-empty";
import { Code2, Pointer } from "lucide-react";

export function WalkthroughEmpty({ pillar }: { pillar: "code" | "product" }) {
  return (
    <IconEmpty icon={pillar === "code" ? <Code2 /> : <Pointer />}>
      No {pillar} walkthrough has been authored for this branch yet.
    </IconEmpty>
  );
}
