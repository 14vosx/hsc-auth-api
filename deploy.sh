#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/hsc-auth-api"
SERVICE="hsc-auth-api.service"
BRANCH="main"
HEALTH_URL="https://auth-api.haxixesmokeclub.com/health"
RUN_AS="hscapi"

lock="/tmp/hsc-auth-api-deploy.lock"
exec 9>"$lock"
flock -n 9 || { echo "ERROR: deploy already running (lock: $lock)"; exit 1; }

cd "$APP_DIR"

usage() {
  echo "Usage:"
  echo "  $0                 # deploy (default)"
  echo "  $0 deploy          # deploy"
  echo "  $0 tag             # create & push release tag for current HEAD"
  echo "  $0 rollback <tag>  # rollback to a release tag"
  echo "  $0 status          # show service status + health"
}

health_check() {
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    echo "==> Health: OK"
  else
    echo "==> Health: FAIL"
    echo "==> Last logs:"
    /usr/bin/journalctl -u "$SERVICE" -n 120 --no-pager || true
    return 1
  fi
}

do_deploy() {
  echo "==> Starting deploy (root orchestrator, app user: $RUN_AS)"
  echo "==> Git fetch..."
  sudo -u "$RUN_AS" -H git fetch origin

  echo "==> Git branch check..."
  current_branch="$(sudo -u "$RUN_AS" -H git rev-parse --abbrev-ref HEAD)"
  if [ "$current_branch" != "$BRANCH" ]; then
    echo "ERROR: Not on $BRANCH (current: $current_branch)"
    exit 1
  fi

  echo "==> Git pull (ff-only)..."
  sudo -u "$RUN_AS" -H git pull --ff-only origin "$BRANCH"

  echo "==> Install production deps (npm ci --omit=dev)..."
  sudo -u "$RUN_AS" -H npm ci --omit=dev

  # Tag automática (opcional): descomente se quiser tagar TODO deploy.
  # do_tag >/dev/null

  echo "==> Restarting service..."
  /usr/bin/systemctl restart "$SERVICE"

  echo "==> Waiting for service..."
  sleep 2

  echo "==> Service status..."
  /usr/bin/systemctl status "$SERVICE" --no-pager -l || true

  echo "==> Health check..."
  health_check

  echo "==> Deploy successful."
}

do_tag() {
  # tag anotada baseada em tempo (UTC) para consistência
  TAG="release-$(date -u +%Y%m%d-%H%M%S)"
  echo "==> Creating tag: $TAG"

  sudo -u "$RUN_AS" -H git tag -a "$TAG" -m "Deploy $TAG"
  sudo -u "$RUN_AS" -H git push origin "$TAG"

  echo "$TAG"
}

do_rollback() {
  local TAG="${1:-}"
  if [ -z "$TAG" ]; then
    echo "ERROR: missing tag"
    usage
    exit 1
  fi

  echo "==> Rollback to tag: $TAG"
  sudo -u "$RUN_AS" -H git fetch --tags origin

  # garante que a tag existe
  if ! sudo -u "$RUN_AS" -H git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    echo "ERROR: tag not found: $TAG"
    echo "==> Available tags:"
    sudo -u "$RUN_AS" -H git tag --list "release-*" --sort=-creatordate | head -n 20
    exit 1
  fi

  echo "==> Reset hard to tag..."
  sudo -u "$RUN_AS" -H git reset --hard "$TAG"

  echo "==> Install production deps (npm ci --omit=dev)..."
  sudo -u "$RUN_AS" -H npm ci --omit=dev

  echo "==> Restarting service..."
  /usr/bin/systemctl restart "$SERVICE"
  sleep 2

  echo "==> Service status..."
  /usr/bin/systemctl status "$SERVICE" --no-pager -l || true

  echo "==> Health check..."
  health_check

  echo "==> Rollback successful."
}

do_status() {
  echo "==> Service status:"
  /usr/bin/systemctl status "$SERVICE" --no-pager -l || true
  echo
  echo "==> Health:"
  curl -fsS "$HEALTH_URL" && echo
}

cmd="${1:-deploy}"
case "$cmd" in
  deploy) do_deploy ;;
  tag) do_tag ;;
  rollback) shift; do_rollback "${1:-}" ;;
  status) do_status ;;
  -h|--help|help) usage ;;
  *) echo "ERROR: unknown command: $cmd"; usage; exit 1 ;;
esac
