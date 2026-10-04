#!/usr/bin/env bash
set -euo pipefail
# Disposable Compose project: never deletes production volumes.
project="matchpoint-ci-${GITHUB_RUN_ID:-$$}"
compose=(docker compose -p "$project" -f compose.yml)
export MATCHPOINT_IMAGE="${SMOKE_IMAGE:-matchpoint:ci}"
export MATCHPOINT_BIND=127.0.0.1
export MATCHPOINT_PORT="${SMOKE_PORT:-4178}"
export MATCHPOINT_ARCHIVE_SYNC=false
cleanup() { "${compose[@]}" logs --no-color || true; "${compose[@]}" down --volumes --remove-orphans || true; }
trap cleanup EXIT
"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait --wait-timeout 90
TEST_URL="http://127.0.0.1:$MATCHPOINT_PORT" node scripts/smoke.mjs
uid=$("${compose[@]}" exec -T app id -u)
[ "$uid" = "1000" ] || { echo "Expected non-root uid 1000, got $uid"; exit 1; }
if "${compose[@]}" exec -T app sh -c 'touch /app/root-write-test' 2>/dev/null; then echo 'Root filesystem should be read-only'; exit 1; fi
# Probe data and actual logo URLs across container replacement.
"${compose[@]}" exec -T app node --input-type=module -e '
 import {mkdir,writeFile,copyFile} from "node:fs/promises";
 await mkdir("/app/data/logos",{recursive:true});
 await writeFile("/app/data/restart-marker","persistent");
 await copyFile("/app/assets/icon-192.png","/app/data/logos/team-logo-aabb.png");
 await writeFile("/app/data/logos/team-logos.json",JSON.stringify({version:1,teams:{"ci:persistence":{dark:"/assets/team-logo-aabb.png",light:"/assets/team-logo-aabb.png"}},updatedAt:"ci-persistence-probe"}));
'
"${compose[@]}" up -d --force-recreate --wait --wait-timeout 90
"${compose[@]}" exec -T app node --input-type=module -e '
 import assert from "node:assert/strict";import {readFile} from "node:fs/promises";
 assert.equal(await readFile("/app/data/restart-marker","utf8"),"persistent");
 const index=await (await fetch("http://127.0.0.1:4177/assets/team-logos.json")).json();assert.equal(index.updatedAt,"ci-persistence-probe");
 const image=await fetch("http://127.0.0.1:4177/assets/team-logo-aabb.png");assert.equal(image.status,200);assert.equal(image.headers.get("content-type"),"image/png");
 assert.deepEqual(Buffer.from(await image.arrayBuffer()),await readFile("/app/assets/icon-192.png"));
'
TEST_URL="http://127.0.0.1:$MATCHPOINT_PORT" node scripts/smoke.mjs
printf 'PASS non-root, read-only filesystem, named-volume persistence after container replacement\n'
