export interface SectionFold {
  placed: number[];
  prose: string;
  trailing: number[];
}

const RANGE_MARKER = /\{\{range:(?<index>\d+)\}\}/g;
const CAPTURE_MARKER = /\{\{capture:(?<index>\d+)\}\}/g;

const CHIP_HREF = /^#walkthrough-target-(?<index>\d+)$/;

/**
 * A fragment rather than a custom scheme: react-markdown's `defaultUrlTransform`
 * blanks any URL whose protocol is outside its safe list, so `docent:0` would be
 * dropped. A URL with no colon is treated as relative and passed through untouched.
 */
export function targetChipHref(index: number): string {
  return `#walkthrough-target-${index}`;
}

export function targetChipIndex(href: string): number | undefined {
  const match = CHIP_HREF.exec(href);

  return match === null ? undefined : Number(match.groups?.index);
}

/**
 * Markers are rewritten in place rather than split on: these targets render in a
 * panel beside the prose, so splitting the body at a marker would tear the
 * paragraph into separate markdown blocks. Rewriting keeps the body one block
 * while giving the marker a real position for its chip.
 *
 * A marker naming a target the section lacks stays literal; a target no marker
 * placed is returned in `trailing`, so nothing is silently dropped.
 */
function foldSection(body: string, count: number, marker: RegExp): SectionFold {
  const placed: number[] = [];

  marker.lastIndex = 0;
  const prose = body.replaceAll(marker, (match, digits: string) => {
    const index = Number(digits);

    if (index >= count) {
      return match;
    }

    if (!placed.includes(index)) {
      placed.push(index);
    }

    return `[](${targetChipHref(index)})`;
  });

  const trailing: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (!placed.includes(index)) {
      trailing.push(index);
    }
  }

  return { placed, prose: prose.trim(), trailing };
}

export function foldRangeSection(
  body: string,
  rangeCount: number
): SectionFold {
  return foldSection(body, rangeCount, RANGE_MARKER);
}

export function foldCaptureSection(
  body: string,
  captureCount: number
): SectionFold {
  return foldSection(body, captureCount, CAPTURE_MARKER);
}
