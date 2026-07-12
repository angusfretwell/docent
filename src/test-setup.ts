import { mock } from "bun:test";

import { noop } from "radashi";

globalThis.console.log = mock(noop);
