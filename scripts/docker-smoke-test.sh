#!/usr/bin/env bash
# V6.9.2 — Docker smoke test (Group D, item 12).
#
# HONESTY NOTE: this script was written and reasoned through carefully, but
# could NOT be executed in the environment that produced this patch — no
# Docker daemon was available there. What WAS verified there, without
# Docker, was the runtime layout this image reproduces: a prod-only
# `npm ci --omit=dev` install against dist/server.cjs + src/data, run
# directly with `node`, hitting /api/health, /api/dashboard/metrics, the
# security headers, and a SIGTERM graceful shutdown (documented in
# README_V6_9_2_GROUP_C_D.txt). That reproduction is what caught and fixed
# two real bugs (the import.meta.url health-check crash and the
# unconditional `vite` import breaking a prod-only install) before this
# script was ever written.
#
# Run this script for real in any environment with Docker before trusting
# the Dockerfile: `bash scripts/docker-smoke-test.sh`. It is intentionally
# strict (set -e) so any failure stops the script rather than silently
# continuing to the next check.

set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE_TAG="lexicora-smoke-test:local"
CONTAINER_NAME="lexicora-smoke-test-$$"
HOST_PORT="38080"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[1/6] docker build"
docker build -t "$IMAGE_TAG" .

echo "[2/6] docker run (detached)"
docker run -d --name "$CONTAINER_NAME" -p "${HOST_PORT}:3000" -e PORT=3000 -e NODE_ENV=production "$IMAGE_TAG"

echo "[3/6] wait for readiness (up to 30s)"
ready=false
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${HOST_PORT}/api/health" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != "true" ]; then
  echo "FAIL: container did not become reachable within 30s"
  docker logs "$CONTAINER_NAME" || true
  exit 1
fi
echo "PASS: container reachable"

echo "[4/6] health payload reports ready:true"
health_json="$(curl -sf "http://127.0.0.1:${HOST_PORT}/api/health")"
echo "$health_json"
if ! echo "$health_json" | grep -q '"ready":true'; then
  echo "FAIL: /api/health did not report ready:true"
  exit 1
fi
echo "PASS: ready:true"

echo "[5/6] Docker HEALTHCHECK reports healthy (up to 60s)"
healthy=false
for _ in $(seq 1 60); do
  status="$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")"
  if [ "$status" = "healthy" ]; then
    healthy=true
    break
  fi
  sleep 1
done
if [ "$healthy" != "true" ]; then
  echo "FAIL: Docker HEALTHCHECK never reported healthy (last status: ${status:-unknown})"
  exit 1
fi
echo "PASS: Docker HEALTHCHECK healthy"

echo "[6/6] graceful shutdown on docker stop"
start_ts=$(date +%s)
docker stop -t 15 "$CONTAINER_NAME" >/dev/null
end_ts=$(date +%s)
exit_code="$(docker inspect --format='{{.State.ExitCode}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")"
elapsed=$((end_ts - start_ts))
echo "docker stop took ${elapsed}s, container ExitCode=${exit_code}"
if [ "$exit_code" != "0" ]; then
  echo "FAIL: container did not exit 0 on docker stop (server.ts's SIGTERM handler should call process.exit(0))"
  exit 1
fi
echo "PASS: graceful shutdown"

echo ""
echo "6/6 Docker smoke checks PASS"
