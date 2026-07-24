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
