#!/usr/bin/env bash
# Chạy trên EC2 (qua AWS SSM, quyền root): kéo image mới từ ECR và khởi động lại service ứng dụng.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; . ./.env.aws; set +a
export COMPOSE_FILE=docker-compose.aws.yml:docker-compose.apps.yml
dc() { docker compose --env-file .env.aws "$@"; }

APPS="job-service user-service api-gateway ai-matching notification-service"

/snap/bin/aws ecr get-login-password --region ap-southeast-2 \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

dc pull $APPS
dc up -d qdrant $APPS

# Caddyfile là bind mount 1 file: đổi nội dung (git tạo file mới) thì phải tạo lại container
if [ -n "${OLD_COMMIT:-}" ] && sudo -u ubuntu git diff --name-only "$OLD_COMMIT" HEAD | grep -qx 'aws/Caddyfile'; then
  echo "Caddyfile đã đổi: tạo lại caddy"
  dc up -d --force-recreate caddy
fi

docker image prune -f >/dev/null
dc ps