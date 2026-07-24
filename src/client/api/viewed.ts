import type { ViewedRequest } from "@shared/schemas/review";
import { ViewedEvent } from "@shared/schemas/review";
import { Schema } from "effect";

import { client } from "./client";

const decodeEvent = Schema.decodeUnknownSync(ViewedEvent);

/** `POST /api/viewed` — append a mark-as-viewed toggle; returns the stored event. */
export async function toggle(body: ViewedRequest): Promise<ViewedEvent> {
  const event = await client.post("viewed", { json: body }).json();
  return decodeEvent(event);
}
