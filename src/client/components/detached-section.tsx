const pillStyle: React.CSSProperties = {
  borderRadius: "0.35rem",
  fontSize: "0.75rem",
  padding: "0.05rem 0.45rem",
  whiteSpace: "nowrap",
};
const outdatedStyle: React.CSSProperties = {
  ...pillStyle,
  background: "rgba(224,108,32,0.2)",
  color: "#e0863c",
};
const explanationStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  opacity: 0.6,
};

/**
 * The trailing "Detached findings" shell shared by both pillar tabs: a
 * Finding whose anchor target (a walkthrough section or a capture) no longer
 * exists on the shown, immutable walkthrough renders here instead of
 * vanishing (data-model.md §6.2, walkthroughs.md §8). Each pillar supplies its
 * own `explanation` and its own rendering of each detached note as `children`;
 * the caller decides whether there's anything to show (render nothing when
 * there are no detached notes) — this shell always renders its chrome.
 */
export function DetachedSection({
  explanation,
  children,
}: {
  explanation: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        borderTop: "1px solid rgba(128,128,128,0.2)",
        padding: "1rem 0",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
        <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Detached findings</h2>
        <span style={outdatedStyle}>Outdated</span>
      </div>
      <p style={explanationStyle}>{explanation}</p>
      {children}
    </section>
  );
}
