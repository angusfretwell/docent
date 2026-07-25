import { Logo } from "@client/components/logo";

import { CopyButton } from "./copy-button";

const INSTALL_COMMAND = "npx skills add angusfretwell/docent";

export function App() {
  return (
    <div className="mx-auto max-w-375 p-6 sm:p-12">
      <div className="typeset typeset-site">
        <header className="flex items-center gap-2.5">
          <Logo />
          <span className="font-semibold">Docent</span>
          <a
            href="https://github.com/angusfretwell/docent"
            className="ml-auto"
            rel="noreferrer"
            target="_blank"
          >
            GitHub ↗
          </a>
        </header>

        <main>
          <div className="my-(--typeset-flow) border-b-2 py-(--typeset-flow)">
            <h1 className="my-0 text-4xl leading-tight font-extrabold tracking-tight text-pretty sm:text-[clamp(2rem,8vw,6.25rem)]">
              Guided reviews
              <br />
              of your{" "}
              <span className="-mx-[0.1em] inline-block bg-yellow-400 px-[0.1em] pb-[0.05em] leading-[0.9em] decoration-yellow-400 dark:bg-transparent dark:underline">
                agent&rsquo;s
              </span>{" "}
              work
            </h1>
          </div>

          <div className="gap-x-12 lg:grid lg:grid-cols-2">
            <div className="max-w-[36em]">
              <p className="text-pretty">
                Docent is a review surface for agent-written code. Fast,
                beautiful diffs, walkthroughs of code changes, and tours of
                product changes, complete with annotated screenshots and
                recordings.
              </p>

              <p>
                <a href="/demo">Try an interactive demo &rarr;</a>
              </p>
            </div>

            <div>
              <p className="mb-[calc(var(--typeset-flow)/2)]">
                Docent installs as an agent skill:
              </p>

              <div className="flex h-14 items-center gap-2 border-2 border-foreground px-4 font-mono text-[0.9em] sm:h-16 sm:px-5">
                <span className="text-muted-foreground">$</span>
                <span className="truncate">{INSTALL_COMMAND}</span>
                <CopyButton
                  className="-mr-1 ml-auto"
                  label="Copy install command"
                  text={INSTALL_COMMAND}
                />
              </div>

              <p className="mt-[calc(var(--typeset-flow)/2)]">
                Run <code>/docent</code> on a branch to get started.
              </p>
            </div>
          </div>
        </main>

        <footer className="pt-(--typeset-flow) text-[0.9em] text-muted-foreground">
          <p>
            Built by{" "}
            <a
              rel="noreferrer"
              target="_blank"
              href="https://github.com/angusfretwell"
              className="text-foreground"
            >
              Angus Fretwell
            </a>
            .
          </p>
        </footer>
      </div>
    </div>
  );
}
