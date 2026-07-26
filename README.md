# Docent

**Guided reviews of your agent's work.**

Docent is a review surface for agent-written code. Fast, beautiful diffs, walkthroughs of code changes, and tours of product changes, complete with annotated screenshots and recordings.

[Try an interactive demo →](https://docent.website/demo)

## Install

Docent installs as an agent skill:

```sh
npx skills add angusfretwell/docent
```

Run `/docent` on a branch to get started.

## How it works

`/docent` authors two walkthroughs of the branch under review, served together in the browser. A **code** tour through the diff, and a **product** tour that drives your running app the way a user would.

Two more invocations close the loop:

- `/docent --read` pulls the review's comments into your agent session to work on.
- `/docent --write` records the session's review outcomes back.

Everything docent knows about a branch lives in `.docent/` at the repo root, on your machine.

## CLI

The skill drives the `docent` CLI. There's nothing to install globally:

```sh
npx @angusfretwell/docent@latest
```

## Acknowledgements

Docent's diff surface is built on [Pierre](https://pierre.computer/)'s excellent open source [diff rendering](https://diffs.com/) and [file tree rendering](https://trees.software/) libraries.

## License

MIT
