import { Schema } from "effect";
import ky, { isHTTPError } from "ky";
import type { HTTPError } from "ky";

import { apiBaseUrl } from "../lib/basepath";
import { backend } from "./backend";

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
  baseUrl: apiBaseUrl,
  fetch: backend.fetch,
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
