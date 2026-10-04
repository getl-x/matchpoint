# Matchpoint Production Deployment Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement inline, with completion verified before publication.

**Goal:** Deliver the current official-data website as a persistent Docker deployment, push source to GitHub, and run an Actions Docker Hub release pipeline.

**Architecture:** Keep the dependency-free Node server. Centralize runtime configuration and redirect generated images to the persistent data volume while retaining public asset URLs. CI tests application behavior and a real, non-root read-only container before multi-platform publication.

**Tech Stack:** Node 24, native node:test, Docker Compose, GitHub Actions, Docker Hub, optional Caddy TLS.

**Spec:** docs/superpowers/specs/2026-10-04-production-deployment.md

## Global Constraints

- Existing read-only official data, graph identity and PWA behavior remain intact.
- No paid API/model calls or web_search.
- Never commit credentials, generated official caches or screenshots.
- Node 24 container runs as uid 1000; only /app/data and /tmp writable.
- Missing registry credentials must be an explicit publication limitation.

## Review Focus

- Fresh volumes must not hide PWA icons or JavaScript.
- Cached logo paths must survive a container upgrade.
- Health must work when official sites are unavailable; storage failures stop startup.
- Invalid ports, sync methods and traversal paths must fail safely.
- CI must build/smoke-test without Docker Hub credentials and report unpublished state accurately.

### Task 1: Production server and persistent storage

**Files:** server/config.mjs; server.mjs; server/archive.mjs; server/team-logos.mjs; tests/deployment.test.mjs.

- [x] Add behavior tests for isolated data storage, serving cached logos and health/static routes without official network.
- [x] Run tests, implement runtime validation, persistent paths, startup readiness, sync throttling and signal shutdown.
- [x] Run complete Node and affected browser checks.

### Task 2: Container and operator delivery

**Files:** Dockerfile; .dockerignore; .gitignore; compose.yml; compose.build.yml; compose.https.yml; deploy/Caddyfile; .env.example; scripts/smoke.mjs; scripts/container-smoke.sh; README.md; docs/DEPLOYMENT.md; package.json.

- [x] Produce a small non-root read-only image with a single data volume and Node health check.
- [x] Add ready-to-run Docker Hub Compose, local-build override, HTTPS example, update/backup instructions.
- [x] Verify application smoke locally and real Docker build/persistence in CI (Docker unavailable on this workstation).

### Task 3: GitHub CI and publication

**Files:** .github/workflows/ci.yml; .github/workflows/docker-publish.yml.

- [x] Add Node tests and real Docker Compose smoke before publication; build amd64/arm64 images.
- [x] Create private repository, commit source and push after review.
- [x] Observe actual Actions results; configure Docker Hub username and document required token without trying to retrieve other repositories' secrets.
- [ ] Publish a version when credentials are available; otherwise deliver the concrete tested pipeline and report exactly what prevents registry publication.

## Execution Ledger

- Preflight: project has no Git repository or Docker CLI; GitHub CLI authenticated as getl-x. Existing Docker Hub username getl discovered from repository variables, but secrets are not transferable/readable.

- Local implementation: 90 Node tests pass; 55 JavaScript files pass syntax checks; actionlint 1.7.12 and Bash syntax checks pass. Production smoke and prior browser regressions passed before the final audit fixes, with affected browser reruns in progress.
- Review fixes: encoded traversal reproduced 200 then blocked 404; incomplete refresh reproduced 13-to-1 loss then retained 13 original matches; shutdown awaits active archive/logo persistence (3 tests). Temporary research removed from the index and ignored.
- Publication prerequisite: Docker Hub username variable configured as getl; new repository has no DOCKERHUB_TOKEN Secret. No credential value has been retrieved or copied.

- Task 1 complete: 90 tests and affected browser regressions pass. Independent review fixes approved.
- Task 2 complete: real GitHub Actions container check passed at run 37182810185, including Compose, UID 1000, read-only, fresh static assets and volume persistence. Downloadable amd64 image saved.
- Task 3 source/pipeline complete: private getl-x/matchpoint created; main pushed; workflow verified. Docker Hub publication remains pending user configuration of DOCKERHUB_TOKEN; username variable getl already configured.
