# Docent

Run docent with nothing installed:

```sh
npx docent
```

This is a thin (~KB) shim. On first run it downloads the standalone `docent`
binary for your platform from [GitHub Releases][releases], caches it under
`~/.cache/docent/bin` (override with `DOCENT_CACHE_DIR`), and execs it. The
binary embeds the full UI and serves it locally — no Node, Bun, or other
runtime required beyond `git`.

`npx docent` (equivalently `docent serve`) boots the local server, prints the
URL, and opens the browser.

[releases]: https://github.com/angusfretwell/docent/releases
