export type ResolvedScheme = "dark" | "light";

/**
 * rrweb rebuilds the captured page inside an iframe, freezing whichever theme
 * the app resolved at capture time. A page themed with `prefers-color-scheme`
 * carries both variants in its stylesheets — only the media query's match
 * decided which showed. That match can't be re-evaluated for a different
 * preference at runtime (setting `color-scheme` doesn't move it), but the media
 * condition itself is mutable: forcing each `prefers-color-scheme` block on or
 * off to match the target scheme repaints the frame with no rebuild.
 *
 * Pages themed by a class or attribute toggle carry no such media blocks, so
 * they stay as captured — there is nothing generic to rewrite.
 */
const originalConditions = new WeakMap<CSSMediaRule, string>();

function forceSheetScheme(sheet: CSSStyleSheet, scheme: ResolvedScheme) {
  let rules: CSSRuleList;

  try {
    rules = sheet.cssRules;
  } catch {
    // Cross-origin stylesheets throw on `cssRules`; nothing to rewrite there.
    return;
  }

  for (const rule of rules) {
    // Duck-typed rather than `instanceof`: the rules live in the iframe's realm,
    // so the parent's `CSSMediaRule` never matches. Media rules carry both a
    // `media` list and nested `cssRules`; import rules have only the former.
    if (!("media" in rule) || !("cssRules" in rule)) {
      continue;
    }

    const mediaRule = rule as CSSMediaRule;
    const original =
      originalConditions.get(mediaRule) ?? mediaRule.media.mediaText;

    if (!original.includes("prefers-color-scheme")) {
      continue;
    }

    originalConditions.set(mediaRule, original);

    const blockIsDark = original.includes("prefers-color-scheme: dark");
    const blockShouldMatch = blockIsDark === (scheme === "dark");
    mediaRule.media.mediaText = blockShouldMatch ? "all" : "not all";
  }
}

export function applyReplayScheme(
  iframe: HTMLIFrameElement,
  scheme: ResolvedScheme
) {
  const doc = iframe.contentDocument;

  if (doc === null) {
    return;
  }

  doc.documentElement.style.colorScheme = scheme;

  for (const sheet of doc.styleSheets) {
    forceSheetScheme(sheet, scheme);
  }
}
