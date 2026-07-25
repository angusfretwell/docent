const INSTALL_COMMAND = "npx skills add angusfretwell/docent";

export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-24">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">
        docent
      </h1>

      <p className="text-lg leading-relaxed text-muted-foreground">
        Review your agent's work with guided walkthroughs of code and product
        changes.
      </p>

      <code className="rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground">
        {INSTALL_COMMAND}
      </code>
    </main>
  );
}
