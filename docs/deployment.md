# Deploying the site

How `docent.website` ships, and the one-time Vercel and Buildkite setup it depends on.

## How a deploy works

The `deploy site` step in `.buildkite/pipeline.yml` owns the whole pipeline. A push to `main` publishes production; a pull request publishes a preview and annotates the build with the URL, which a reviewer reaches from the Buildkite check on the PR. The step depends on `check`, `typecheck` and `test`, so a red build never deploys.

The agent does all the work — capture the demo snapshot with a headless browser against a throwaway fixture, bundle the worker and the site — and then `scripts/assemble-vercel-output.ts` copies `dist/site` into `.vercel/output/static` and writes `.vercel/output/config.json`. `vercel deploy --prebuilt` uploads that directory and nothing else: Vercel runs no install, no build, no fixture prep and no browser.

Three consequences worth knowing:

- **The routing contract lives in the repo**, in the `config.json` that the assembly script generates. There is deliberately no `vercel.json`, and Project Settings (framework preset, build command, output directory) are never consulted.
- **`.vercel/` is gitignored** — it holds the local project link and the assembled output, both generated.
- **The preview URL is a build annotation, not a PR comment.** A comment would mean storing a GitHub token in Buildkite and running a bot identity; the annotation costs no extra credential and sits at the top of the build the PR's check already links to.

## One-time Vercel setup

1. **Create the project from the CLI, not by importing the repo in the dashboard.** Importing connects Vercel's Git integration, which deploys every push a second time and builds that one from source.

   ```sh
   bunx vercel@57.0.0 login
   bunx vercel@57.0.0 link   # personal scope; name it docent-website
   ```

2. **Read the ids** the deploy needs: `cat .vercel/project.json` → `orgId`, `projectId`.

3. **Create an access token** at <https://vercel.com/account/tokens>, scoped to the team that owns the project.

4. **Point the domain at the project**: `bunx vercel@57.0.0 domains add docent.website`, then set it as the production domain (Settings → Domains).

5. **Check Settings → Deployment Protection.** Vercel Authentication is what makes a preview URL demand a Vercel login; if reviewers outside the team need to open PR previews, set its scope to none or hand out a shareable link.

If the project is ever connected to GitHub after all, disconnect it (Settings → Git) or set `git.deploymentEnabled` to `false`; otherwise each push deploys twice and the Git-integration copy tries to build from source.

## One-time Buildkite setup

1. **Add three cluster secrets** (Agents → the pipeline's cluster → Secrets → New Secret). The keys have to match the env var names the step asks for, because it uses the plain list form of `secrets:`.

   | Key                 | Value                                             |
   | ------------------- | ------------------------------------------------- |
   | `VERCEL_TOKEN`      | the access token from Vercel step 3               |
   | `VERCEL_ORG_ID`     | `orgId` (`team_…`) from `.vercel/project.json`    |
   | `VERCEL_PROJECT_ID` | `projectId` (`prj_…`) from `.vercel/project.json` |

   Both ids are required — the Vercel CLI only treats them as the project link when both are set, and errors if just one is. Only a cluster maintainer or org admin can create secrets, and they are readable only by agents in that cluster.

   `secrets:` needs buildkite-agent 3.106.0 or later. On an older agent, replace it with `buildkite-agent secret get` calls in the command; the values are redacted from build logs either way.

2. **Turn on Build Pull Requests** (Pipeline Settings → GitHub). Without it no PR ever builds, so no preview is ever produced. This is not configurable from the repo.

3. **Leave Build Pull Requests From Forks off.** The step also refuses fork PRs itself, but the setting is what stops a fork's code reaching an agent that holds the Vercel token at all.

4. **Consider Cancel Intermediate Builds** (Pipeline Settings → Builds) for non-default branches. The step's `concurrency_group` already guarantees a newer deploy lands after an older one; cancelling superseded builds just stops paying for the losers.

5. **Run the pipeline on `main` first.** The first deployment of a new Vercel project is always a production deployment even without `--prod`, so a PR preview run before that would publish itself to production.

## The capture browser

The step runs `bunx playwright install --with-deps chromium`, which shells out to apt for chromium's shared libraries and therefore needs the job to have root. If it doesn't, the build stops on that line.

The fix is not a workaround in the pipeline — it is a [custom hosted-agent image](https://buildkite.com/docs/agent/buildkite-hosted/linux/custom-agent-images) for the queue, based on the Buildkite hosted agent base image, that installs the deps once at image build time. That is also faster than paying for an apt install on every deploy.
