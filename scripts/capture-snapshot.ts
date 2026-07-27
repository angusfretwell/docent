#!/usr/bin/env bun

/**
 * Record the hosted demo's request/response map to `dist/demo-snapshot.json`:
 * materialize the deterministic fixture, run `docent serve` against it, and
 * drive a scripted Playwright tour of the real review client, keeping every API
 * response the client emits.
 *
 * The tour clicks the product rather than fetching a hand-written list of urls,
 * because only the client knows the whole set of requests it can make — a list
 * would drift the moment a feature asks for something new, and the demo would
 * 501 on it. Every file in the diff, both Pending ranges, every Comment status,
 * and every Walkthrough Section and capture is visited.
 *
 * It then validates its own output by constructing a `replayHandler` over it and
 * replaying every recorded request, so a capture that missed a surface fails the
 * build here rather than in a visitor's browser.
 *
 * Read-only by design: a comment or a mark-viewed would append records to the
 * fixture's `.docent/` mid-tour and the capture would be of a moving target.
 *
 * Heavy (a server plus a headless browser), so it stays out of `bun run build`
 * and `preflight`; CI runs it before the demo build.
 *
 *   bun run build:snapshot
 *
 * @see src/website/demo/snapshot.ts for the format this writes.
 * @see src/website/demo/replay-handler.ts for what consumes it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { ReviewSnapshot } from "@shared/schemas/review";
import { Schema } from "effect";
import { chromium } from "playwright";
import type { Page, Response as CapturedResponse } from "playwright";
import { alphabetical, pick } from "radashi";

import { ServeAddress } from "../src/serve/address";
import { replayHandler } from "../src/website/demo/replay-handler";
import { requestFromKey, requestKey } from "../src/website/demo/snapshot";
import type {
  DemoSnapshot,
  RecordedResponse,
} from "../src/website/demo/snapshot";
import { ensureDiffWorker } from "./build-worker";
import { materializeFixture } from "./prepare-fixture";

const repoRoot = path.join(import.meta.dir, "..");
const entry = path.join(repoRoot, "src", "docent.ts");
const output = path.join(repoRoot, "dist", "demo-snapshot.json");

/**
 * A fixed path, not `mkdtemp`: the served repo's root rides in `/api/diff`'s and
 * `/api/pending`'s `root`, so a random directory would make the snapshot differ
 * byte-for-byte between runs on the same machine.
 */
const fixtureDir = path.join(tmpdir(), "docent-demo-fixture");

const READY_TIMEOUT_MS = 30_000;
const POLL_MS = 100;

/** Wide enough that the client renders its desktop layout — file tree and Comments panel both mounted. */
const VIEWPORT = { height: 900, width: 1440 };

/** Bounded wait after each interaction, so in-flight reads land before the tour moves on. */
const SETTLE_MS = 500;

/** A guard against a walkthrough whose capture stepping never disables its Next button. */
const MAX_CAPTURE_STEPS = 64;

const REPLAYED_HEADERS = ["cache-control", "content-type"];

/**
 * `/api/events` is an SSE stream whose body never ends, so recording it would
 * hang the tour — and `replayHandler` synthesizes the stream anyway.
 */
const EVENTS_KEY = "GET /api/events";

/** The read that seeds the demo, and the client's signal that it has booted. */
const REVIEW_KEY = "GET /api/review";

const decodeReview = Schema.decodeUnknownSync(ReviewSnapshot);
const decodeServeAddress = Schema.decodeUnknownSync(ServeAddress);

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * The fixture commits a clean tree, so `/api/pending` answers `dirty: false`
 * with an empty patch and the demo could never show the Pending view. This is
 * the in-progress edit a reviewer would be looking at: fixed content applied to
 * a tracked file, so the recorded patch — blob SHAs included — is identical
 * every run.
 */
const PENDING_EDIT = {
  file: path.join("src", "export.js"),
  found: '      { $type: "color", $value: hex },',
  rewritten: '      { $type: "color", $value: hex.toLowerCase() },',
};

function dirtyWorktree(): void {
  const file = path.join(fixtureDir, PENDING_EDIT.file);
  const source = readFileSync(file, "utf-8");

  assert(
    source.includes(PENDING_EDIT.found),
    `the fixture's ${PENDING_EDIT.file} no longer holds the line the Pending edit rewrites`
  );

  writeFileSync(
    file,
    source.replace(PENDING_EDIT.found, PENDING_EDIT.rewritten)
  );
}

function recordedServeUrl(): string | undefined {
  const address = path.join(fixtureDir, ".docent", "serve.json");

  if (!existsSync(address)) {
    return undefined;
  }

  return decodeServeAddress(JSON.parse(readFileSync(address, "utf-8"))).url;
}

/** `docent serve` records its live url on boot and answers `/api/health` once it is serving. */
async function waitForServer(): Promise<string> {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const url = recordedServeUrl();
    const alive =
      url === undefined
        ? false
        : await fetch(new URL("api/health", url))
            .then((response) => response.ok)
            .catch(() => false);

    if (url !== undefined && alive) {
      return url;
    }

    await Bun.sleep(POLL_MS);
  }

  throw new Error(`docent serve was not ready within ${READY_TIMEOUT_MS}ms`);
}

interface Recorder {
  /** Resolves once every body observed so far has been read. */
  drain: () => Promise<void>;
  observe: (response: CapturedResponse) => void;
  responses: ReadonlyMap<string, RecordedResponse>;
}

/** Reads only: the tour makes no write, and `replayHandler` answers writes from its in-memory Review. */
function isRecordable(key: string): boolean {
  return key.startsWith("GET /api/") && key !== EVENTS_KEY;
}

function responseKey(response: CapturedResponse): string {
  return requestKey({
    method: response.request().method(),
    url: response.url(),
  });
}

function createRecorder(): Recorder {
  const responses = new Map<string, RecordedResponse>();
  const claimed = new Set<string>();
  const bodies: Promise<void>[] = [];

  async function read(response: CapturedResponse, key: string): Promise<void> {
    try {
      responses.set(key, {
        body: await response.text(),
        headers: pick(response.headers(), REPLAYED_HEADERS),
        status: response.status(),
      });
    } catch {
      // An aborted read leaves the key unclaimed, so a later request records it.
      claimed.delete(key);
    }
  }

  return {
    drain: async () => {
      await Promise.all(bodies);
    },
    observe: (response) => {
      const key = responseKey(response);

      if (!isRecordable(key) || claimed.has(key)) {
        return;
      }

      claimed.add(key);
      bodies.push(read(response, key));
    },
    responses,
  };
}

async function settle(page: Page, recorder: Recorder): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  await recorder.drain();
}

/** Resolved threads are filtered out by default, so the whole Status matrix has to be asked for. */
async function revealEveryCommentStatus(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^\d+ comments?$/ }).click();
  await page.getByRole("menuitemcheckbox", { name: "Resolved" }).click();
  await page.keyboard.press("Escape");
}

async function readEveryComment(page: Page, expected: number): Promise<void> {
  const shown = await page.locator('[data-slot="collapsible-panel"]').count();

  assert(
    shown === expected,
    `the Comments panel shows ${shown} of the Review's ${expected} Comments`
  );

  console.log(`Read ${shown} Comments across every Status`);
}

async function visitEveryFile(page: Page, recorder: Recorder): Promise<void> {
  const files = page.locator('[data-item-type="file"]');
  const count = await files.count();

  assert(count > 0, "the diff's file tree rendered no files");

  for (let index = 0; index < count; index += 1) {
    await files.nth(index).click();
    await settle(page, recorder);
  }

  console.log(`Visited ${count} files in the diff`);
}

/**
 * Both ranges, then back to the branch diff, through a single open menu: the
 * Mode items are disabled outside the Pending view, and a radio menu stays open
 * on select.
 */
async function visitPendingRanges(
  page: Page,
  recorder: Recorder
): Promise<void> {
  await page
    .getByRole("button", { name: /^(?<view>Latest change|Pending changes)$/ })
    .click();

  for (const option of [
    "Pending changes",
    "Cumulative",
    "Standalone",
    "Latest change",
  ]) {
    await page.getByRole("menuitemradio", { name: option }).click();
    await settle(page, recorder);
  }

  await page.keyboard.press("Escape");
}

async function openRoute(
  page: Page,
  recorder: Recorder,
  route: string
): Promise<void> {
  await page.locator(`[data-slot="tabs-tab"][href="${route}"]`).click();
  await settle(page, recorder);
}

/** Every chip in the prose, which is how a reader aims the target pane at a Section's range or capture. */
async function selectEveryTarget(
  page: Page,
  recorder: Recorder,
  route: string
): Promise<void> {
  const chips = page.getByRole("button", { name: /^Show / });
  const count = await chips.count();

  assert(count > 0, `${route} rendered no walkthrough target chips`);

  for (let index = 0; index < count; index += 1) {
    await chips.nth(index).click();
    await settle(page, recorder);
  }

  console.log(`Selected ${count} Section targets on ${route}`);
}

/** The capture pager, which reaches a capture whose Section the reader has not scrolled to. */
async function stepThroughCaptures(
  page: Page,
  recorder: Recorder
): Promise<void> {
  const next = page.getByRole("button", { name: "Next capture" });

  for (let step = 0; step < MAX_CAPTURE_STEPS; step += 1) {
    if (!(await next.isEnabled())) {
      console.log(`Stepped through ${step + 1} captures`);
      return;
    }

    await next.click();
    await settle(page, recorder);
  }

  throw new Error("the capture pager never reached its last capture");
}

function recordedReview(
  responses: ReadonlyMap<string, RecordedResponse>
): ReviewSnapshot {
  const recorded = responses.get(REVIEW_KEY);

  assert(
    recorded !== undefined,
    "the client never asked for GET /api/review, so there is nothing to seed the demo with"
  );

  return decodeReview(JSON.parse(recorded.body));
}

function captureKeys(review: ReviewSnapshot): string[] {
  return review.walkthroughs.flatMap((walkthrough) =>
    (walkthrough.manifest?.captures ?? []).map((placed) =>
      requestKey({
        method: "GET",
        url: `/api/capture/${walkthrough.id}/${placed.media}.rrweb.json`,
      })
    )
  );
}

/**
 * The one wait a fixed settle can't bound: `docent serve` bundles the client on
 * first request, so on a cold agent the seeding read lands seconds after
 * `domcontentloaded`. Wait on the response itself, not on a guess at how long
 * booting takes.
 */
async function openClient(
  page: Page,
  recorder: Recorder,
  serveUrl: string
): Promise<void> {
  const seeded = page.waitForResponse(
    (response) => responseKey(response) === REVIEW_KEY,
    { timeout: READY_TIMEOUT_MS }
  );

  await page.goto(serveUrl, { waitUntil: "domcontentloaded" });
  await seeded;
  await settle(page, recorder);
}

async function tour(
  page: Page,
  recorder: Recorder,
  serveUrl: string
): Promise<void> {
  await openClient(page, recorder, serveUrl);

  const review = recordedReview(recorder.responses);

  await revealEveryCommentStatus(page);
  await settle(page, recorder);
  await readEveryComment(page, review.comments.length);

  await visitEveryFile(page, recorder);
  await visitPendingRanges(page, recorder);

  await openRoute(page, recorder, "/code");
  await selectEveryTarget(page, recorder, "/code");

  await openRoute(page, recorder, "/product");
  await stepThroughCaptures(page, recorder);
  await selectEveryTarget(page, recorder, "/product");
}

/**
 * Completeness is the whole point of touring the real client, so it is asserted
 * against the fixture's own seeded state rather than trusted: the Review that
 * seeds the demo, the branch diff, both Pending ranges, and one capture per
 * capture the product Walkthrough's manifest declares.
 */
function assertCoverage(snapshot: DemoSnapshot): void {
  const recorded = new Set(Object.keys(snapshot.responses));
  const review = recordedReview(new Map(Object.entries(snapshot.responses)));

  const missing = [
    "GET /api/diff",
    REVIEW_KEY,
    requestKey({ method: "GET", url: "/api/pending?range=cumulative" }),
    requestKey({ method: "GET", url: "/api/pending?range=incremental" }),
    ...captureKeys(review),
  ].filter((key) => !recorded.has(key));

  assert(missing.length === 0, `the tour never recorded ${missing.join(", ")}`);
  assert(
    !recorded.has(EVENTS_KEY),
    `${EVENTS_KEY} was recorded; replaying a never-ending stream would hang the demo`
  );

  const failed = Object.entries(snapshot.responses).filter(
    ([, response]) => response.status < 200 || response.status >= 300
  );

  assert(
    failed.length === 0,
    `the tour recorded a failure at ${failed.map(([key]) => key).join(", ")}`
  );
}

/**
 * Acceptance runs through the same seam the demo does: `replayHandler` answers
 * an unrecorded read with 501, so replaying every recorded request proves the
 * snapshot serves the browsing the tour just did.
 */
async function assertReplayable(snapshot: DemoSnapshot): Promise<void> {
  const handler = replayHandler(snapshot);

  for (const key of [EVENTS_KEY, ...Object.keys(snapshot.responses)]) {
    const response = await handler(requestFromKey(key));

    assert(response.status !== 501, `replay has no response for ${key}`);
  }
}

/** Keys sorted, so two runs over the same fixture are byte-identical however the client ordered its reads. */
function toSnapshot(
  responses: ReadonlyMap<string, RecordedResponse>
): DemoSnapshot {
  const sorted = alphabetical([...responses], ([key]) => key);

  return { responses: Object.fromEntries(sorted) };
}

function reportInventory(snapshot: DemoSnapshot): void {
  for (const key of Object.keys(snapshot.responses)) {
    console.log(`  ${key}`);
  }
}

async function recordTour(): Promise<DemoSnapshot> {
  const server = Bun.spawn(["bun", entry, "serve", fixtureDir], {
    cwd: repoRoot,
    stdio: ["ignore", "inherit", "inherit"],
  });

  try {
    const serveUrl = await waitForServer();
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({ viewport: VIEWPORT });
      const recorder = createRecorder();

      page.on("response", recorder.observe);

      await tour(page, recorder, serveUrl);
      await page.removeAllListeners("response", { behavior: "wait" });
      await recorder.drain();

      return toSnapshot(recorder.responses);
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
    await server.exited;
  }
}

await ensureDiffWorker();
materializeFixture(fixtureDir);
dirtyWorktree();

const snapshot = await recordTour();

assertCoverage(snapshot);
await assertReplayable(snapshot);

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(`Recorded ${Object.keys(snapshot.responses).length} responses:`);
reportInventory(snapshot);
console.log(`Wrote ${path.relative(repoRoot, output)}`);
