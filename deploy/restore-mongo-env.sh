#!/bin/sh
set -eu

env_file="${1:-.env}"
compose_dir="${2:-$(pwd)}"

if [ ! -f "$env_file" ]; then
  echo "Backend environment file not found: $env_file" >&2
  exit 1
fi

env_value() {
  key="$1"
  value=$(sed -n "s/^${key}=//p" "$env_file" | tail -n 1 | sed \
    -e 's/^[[:space:]]*//' \
    -e 's/[[:space:]]#.*$//' \
    -e 's/[[:space:]]*$//')
  case "$value" in
    \"*\")
      value=${value#\"}
      value=${value%\"}
      ;;
    \'*\')
      value=${value#\'}
      value=${value%\'}
      ;;
  esac
  printf '%s\n' "$value"
}

has_env() {
  [ -n "$(env_value "$1")" ]
}

docker_command() {
  if [ "${MONGO_ENV_RESTORE_NO_SUDO:-false}" = "true" ]; then
    docker "$@"
  else
    sudo docker "$@"
  fi
}

find_container() {
  service="$1"
  found_container=$(docker_command ps -q \
    --filter "label=com.docker.compose.service=${service}" \
    --filter "label=com.docker.compose.project.working_dir=${compose_dir}" | head -n 1)

  if [ -z "$found_container" ]; then
    project_name=$(basename "$compose_dir")
    found_container=$(docker_command ps -q \
      --filter "label=com.docker.compose.service=${service}" \
      --filter "label=com.docker.compose.project=${project_name}" | head -n 1)
  fi

  [ -n "$found_container" ] && printf '%s\n' "$found_container"
}

container_env() {
  container_id="$1"
  key="$2"
  docker_command inspect \
    --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_id" |
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }'
}

container_mount() {
  container_id="$1"
  destination="$2"
  docker_command inspect \
    --format '{{range .Mounts}}{{printf "%s=%s\n" .Destination .Name}}{{end}}' \
    "$container_id" |
    awk -F= -v destination="$destination" \
      '$1 == destination { sub(/^[^=]*=/, ""); print; exit }'
}

set_env() {
  key="$1"
  value="$2"

  if [ -z "$value" ]; then
    echo "Cannot reconcile backend environment variable: ${key}" >&2
    exit 1
  fi

  escaped_value=$(printf '%s' "$value" | sed "s/'/\\\\'/g")
  tmp_file=$(mktemp "${env_file}.tmp.XXXXXX")
  awk -v key="$key" '$0 !~ "^" key "=" { print }' "$env_file" > "$tmp_file"
  printf "%s='%s'\n" "$key" "$escaped_value" >> "$tmp_file"
  chmod 600 "$tmp_file"
  mv "$tmp_file" "$env_file"
}

require_existing_env() {
  key="$1"
  if ! has_env "$key"; then
    echo "Cannot restore missing backend environment variable without a running container: ${key}" >&2
    exit 1
  fi
}

db_container=$(find_container db || true)
if [ -n "$db_container" ]; then
  db_health=$(docker_command inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$db_container")
  if [ "$db_health" != "healthy" ]; then
    echo "Cannot reconcile Mongo credentials from an unhealthy database container" >&2
    exit 1
  fi

  # A healthy initialized Mongo container is authoritative. Reconcile even
  # nonempty values because stale credentials make the application unhealthy.
  set_env MONGO_ROOT_USER \
    "$(container_env "$db_container" MONGO_INITDB_ROOT_USERNAME)"
  set_env MONGO_ROOT_PASSWORD \
    "$(container_env "$db_container" MONGO_INITDB_ROOT_PASSWORD)"
  set_env MONGO_DATA_VOLUME \
    "$(container_mount "$db_container" /data/db)"
  set_env MONGO_CONFIG_VOLUME \
    "$(container_mount "$db_container" /data/configdb)"
else
  for key in \
    MONGO_ROOT_USER \
    MONGO_ROOT_PASSWORD \
    MONGO_DATA_VOLUME \
    MONGO_CONFIG_VOLUME
  do
    require_existing_env "$key"
  done
fi

backup_container=$(find_container mongo-backup || true)
if [ -n "$backup_container" ]; then
  set_env MONGO_BACKUP_VOLUME \
    "$(container_mount "$backup_container" /backups)"
else
  require_existing_env MONGO_BACKUP_VOLUME
fi

echo "Reconciled Mongo credentials and volume names without recreating data"
