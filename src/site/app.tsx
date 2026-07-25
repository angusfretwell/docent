import { Logo } from "@client/components/logo";
import { ThemeToggle } from "@client/components/theme-toggle";

import { CopyButton } from "./copy-button";

const INSTALL_COMMAND = "npx skills add angusfretwell/docent";
const REPO_URL = "https://github.com/angusfretwell/docent";
const DOCS_URL = `${REPO_URL}/blob/main/skills/docent/SKILL.md`;
const AUTHOR_URL = "https://github.com/angusfretwell";

export function App() {
  return (
    <div className="mx-auto max-w-375 p-6 sm:p-12">
      <div className="typeset typeset-site">
        <header className="flex items-center gap-2.5">
          <Logo />
          <span className="font-semibold">Docent</span>
          <div className="ml-auto flex items-center gap-3">
            <a href={REPO_URL} rel="noreferrer" target="_blank">
              GitHub ↗
            </a>
            <ThemeToggle className="-mr-2" />
          </div>
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

              <div className="flex min-h-14 items-center gap-2 border-2 border-foreground px-4 py-2.5 font-mono text-[0.9em] sm:min-h-16 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span aria-hidden="true" className="text-muted-foreground">
                    ${" "}
                  </span>
                  {INSTALL_COMMAND}
                </span>
                <CopyButton
                  className="-mr-1 shrink-0"
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

        <footer className="mt-[calc(var(--typeset-flow)*2)] flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[0.9em] text-muted-foreground">
          <div>
            Built by{" "}
            <a
              className="text-foreground"
              href={AUTHOR_URL}
              rel="noreferrer"
              target="_blank"
            >
              Angus Fretwell
            </a>
            .
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-1 sm:ml-auto">
            <a
              className="text-foreground"
              href={REPO_URL}
              rel="noreferrer"
              target="_blank"
            >
              Repository ↗
            </a>
            <a
              className="text-foreground"
              href={DOCS_URL}
              rel="noreferrer"
              target="_blank"
            >
              Documentation ↗
            </a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
