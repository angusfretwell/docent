/**
 * A Finding rendered as a thread: the root body, its replies, participants, and
 * the (open/resolved × what's-next) state — plus the actions that append the
 * next record (reply, resolve, reopen). One component behind both surfaces a
 * thread appears in: inline in the diff via `renderAnnotation`, and expanded in
 * the Findings panel (diff-review.md §7). It renders a fold; it never mutates —
 * every action is an append-only write the caller routes to `/api/findings`.
 */

import { Badge } from "@client/ui/badge";
import { Button } from "@client/ui/button";
import type { FoldedFinding } from "@shared/lib/finding";
import { WHATS_NEXT_LABEL } from "@shared/lib/finding";
import type { DriftState } from "@shared/schemas/drift";
import type { Author, Disposition } from "@shared/schemas/finding";
import type { FindingWrite } from "@shared/schemas/finding-write";
import { useState } from "react";

import { Composer } from "./composer";
import { DriftPill } from "./drift-badge";

const DISPOSITION_LABEL: Record<Disposition, string> = {
  actioned: "actioned",
  declined: "declined",
  question: "question",
};

function attribution(author: Author): string {
  return author.kind === "agent" ? `${author.display} (agent)` : author.display;
}

function Record({
  author,
  body,
  tag,
}: {
  author: Author;
  body: string;
  tag?: string;
}) {
  return (
    <div className="border-t px-2 py-1.5">
      <div className="mb-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{attribution(author)}</span>
        {tag ? (
          <Badge size="sm" variant="secondary">
            {tag}
          </Badge>
        ) : null}
      </div>
      {body === "" ? null : (
        <div className="whitespace-pre-wrap break-words">{body}</div>
      )}
    </div>
  );
}

export function FindingThread({
  drift,
  finding,
  onWrite,
}: {
  /** The drift standing shown as a pill beside the open/resolved state (inline only). */
  drift?: DriftState;
  finding: FoldedFinding;
  onWrite: (write: FindingWrite) => Promise<void>;
}) {
  const [mode, setMode] = useState<"idle" | "reply" | "resolve">("idle");
  const [busy, setBusy] = useState(false);
  const root = finding.participants.at(0);

  async function run(write: FindingWrite) {
    setBusy(true);
    try {
      await onWrite(write);
      setMode("idle");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-1.5 px-2 py-1.5">
        <span className="flex items-center gap-1.5">
          <Badge size="sm" variant="secondary">
            {finding.resolved ? "Resolved" : "Open"}
          </Badge>
          {drift ? (
            <DriftPill resolved={finding.resolved} state={drift} />
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">
          {WHATS_NEXT_LABEL[finding.whatsNext]}
        </span>
      </div>

      {root ? <Record author={root} body={finding.body} /> : null}
      {finding.replies.map((reply) => (
        <Record
          author={reply.author}
          body={reply.body}
          key={`${reply.createdAt}:${reply.author.id}`}
          tag={
            reply.disposition ? DISPOSITION_LABEL[reply.disposition] : undefined
          }
        />
      ))}

      {mode === "reply" ? (
        <Composer
          autoFocus
          busy={busy}
          onCancel={() => setMode("idle")}
          onSubmit={(body, disposition) =>
            void run({ body, disposition, findingId: finding.id, op: "reply" })
          }
          placeholder="Reply…"
          submitLabel="Reply"
          withDisposition
        />
      ) : null}
      {mode === "resolve" ? (
        <Composer
          autoFocus
          busy={busy}
          onCancel={() => setMode("idle")}
          onSubmit={(body) =>
            void run({ body, findingId: finding.id, op: "resolve" })
          }
          placeholder="Resolve reason (optional)…"
          requireBody={false}
          submitLabel="Resolve"
        />
      ) : null}

      {mode === "idle" ? (
        <div className="flex gap-1.5 px-2 py-1.5">
          <Button onClick={() => setMode("reply")} size="xs" variant="outline">
            Reply
          </Button>
          {finding.resolved ? (
            <Button
              loading={busy}
              onClick={() => void run({ findingId: finding.id, op: "reopen" })}
              size="xs"
              variant="outline"
            >
              Reopen
            </Button>
          ) : (
            <Button
              onClick={() => setMode("resolve")}
              size="xs"
              variant="outline"
            >
              Resolve
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
