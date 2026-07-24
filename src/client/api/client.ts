/**
 * The browser's single HTTP client. Every request to the Bun server goes through
 * this instance (H6 — no `fetch`/`ky` outside `api/`), so error shaping lives in
 * exactly one place: a non-2xx response becomes an `Error` whose message is the
 * server's `{ error }` body when present, else `HTTP <status>`. This replaces the
 * four hand-rolled failure formats the transport sites used to each carry.
 */

import { Schema } from "effect";
import ky, { isHTTPError } from "ky";
import type { HTTPError } from "ky";

const ErrorBody = Schema.Struct({ error: Schema.String });
const decodeErrorBody = Schema.decodeUnknownSync(ErrorBody);

function messageFor(error: HTTPError): string {
  try {
    return decodeErrorBody(error.data).error;
  } catch {
    return `HTTP ${error.response.status}`;
  }
}

export const client = ky.create({
  baseUrl: "/api/",
  hooks: {
    beforeError: [
      (state) => {
        const { error } = state;

        if (isHTTPError(error)) {
          error.message = messageFor(error);
        }

        return error;
      },
    ],
  },
});
