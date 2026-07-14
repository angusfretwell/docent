import { Code2, Pointer } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "../ui/empty";

export function WalkthroughEmpty({ pillar }: { pillar: "code" | "product" }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {pillar === "code" ? <Code2 /> : <Pointer />}
        </EmptyMedia>
        <EmptyDescription>
          No {pillar} walkthrough has been authored for this branch yet.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
