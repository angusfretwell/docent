/**
 * A Finding rendered as a thread: the root body, its replies, participants, and
 * the (open/resolved × what's-next) state — plus the actions that append the
 * next record (reply, resolve, reopen). One component behind both surfaces a
 * thread appears in: inline in the diff via `renderAnnotation`, and expanded in
 * the Findings panel (diff-review.md §7). It renders a fold; it never mutates —
 * every action is an append-only write the caller routes to `/api/findings`.
 */

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

const badgeStyle: React.CSSProperties = {
  background: "rgba(128,128,128,0.15)",
  borderRadius: "0.35rem",
  fontSize: "0.75rem",
  padding: "0.05rem 0.4rem",
};

const recordStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(128,128,128,0.15)",
  padding: "0.4rem 0.5rem",
};

const authorStyle: React.CSSProperties = {
  display: "flex",
  fontSize: "0.75rem",
  gap: "0.4rem",
  marginBottom: "0.15rem",
  opacity: 0.7,
};

const bodyStyle: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const actionBarStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.4rem",
  padding: "0.4rem 0.5rem",
};

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
    <div style={recordStyle}>
      <div style={authorStyle}>
        <span>{attribution(author)}</span>
        {tag ? <span style={badgeStyle}>{tag}</span> : null}
      </div>
      {body === "" ? null : <div style={bodyStyle}>{body}</div>}
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
      <div
        style={{
          ...actionBarStyle,
          justifyContent: "space-between",
          opacity: 0.85,
        }}
      >
        <span style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
          <span style={badgeStyle}>
            {finding.resolved ? "Resolved" : "Open"}
          </span>
          {drift ? (
            <DriftPill resolved={finding.resolved} state={drift} />
          ) : null}
        </span>
        <span style={{ fontSize: "0.75rem" }}>
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
        <div style={actionBarStyle}>
          <button
            className="expand-context"
            onClick={() => setMode("reply")}
            type="button"
          >
            Reply
          </button>
          {finding.resolved ? (
            <button
              className="expand-context"
              disabled={busy}
              onClick={() => void run({ findingId: finding.id, op: "reopen" })}
              type="button"
            >
              Reopen
            </button>
          ) : (
            <button
              className="expand-context"
              onClick={() => setMode("resolve")}
              type="button"
            >
              Resolve
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
