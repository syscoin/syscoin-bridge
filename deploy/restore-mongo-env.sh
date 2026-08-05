#!/bin/sh
set -eu

env_file="${1:-.env}"
compose_dir="${2:-$(pwd)}"

if [ ! -f "$env_file" ]; then
  echo "Backend environment file not found: $env_file" >&2
  exit 1
fi

has_env() {
  grep -Eq "^${1}=.+" "$env_file"
}

if has_env MONGO_ROOT_USER && \
  has_env MONGO_ROOT_PASSWORD && \
  has_env MONGO_BACKUP_VOLUME
then
  exit 0
fi

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

  if [ -z "$found_container" ]; then
    echo "Cannot restore Mongo configuration: no running ${service} container found for ${compose_dir}" >&2
    exit 1
  fi

  printf '%s\n' "$found_container"
}

container_env() {
  container_id="$1"
  key="$2"
  docker_command inspect \
    --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_id" |
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }'
}

set_missing_env() {
  key="$1"
  value="$2"

  if has_env "$key"; then
    return
  fi

  if [ -z "$value" ]; then
    echo "Cannot restore missing backend environment variable: ${key}" >&2
    exit 1
  fi

  escaped_value=$(printf '%s' "$value" | sed "s/'/\\\\'/g")
  tmp_file=$(mktemp "${env_file}.tmp.XXXXXX")
  awk -v key="$key" '$0 !~ "^" key "=" { print }' "$env_file" > "$tmp_file"
  printf "%s='%s'\n" "$key" "$escaped_value" >> "$tmp_file"
  chmod 600 "$tmp_file"
  mv "$tmp_file" "$env_file"
}

if ! has_env MONGO_ROOT_USER || ! has_env MONGO_ROOT_PASSWORD; then
  db_container=$(find_container db)
  set_missing_env MONGO_ROOT_USER \
    "$(container_env "$db_container" MONGO_INITDB_ROOT_USERNAME)"
  set_missing_env MONGO_ROOT_PASSWORD \
    "$(container_env "$db_container" MONGO_INITDB_ROOT_PASSWORD)"
fi

if ! has_env MONGO_BACKUP_VOLUME; then
  backup_container=$(find_container mongo-backup)
  backup_volume=$(docker_command inspect \
    --format '{{range .Mounts}}{{if eq .Destination "/backups"}}{{println .Name}}{{end}}{{end}}' \
    "$backup_container")
  set_missing_env MONGO_BACKUP_VOLUME "$backup_volume"
fi

echo "Restored missing Mongo configuration from the running containers"
