#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
restorer="$script_dir/restore-mongo-env.sh"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT

mkdir -p "$test_dir/bin" "$test_dir/compose"
cat > "$test_dir/bin/docker" <<'EOF'
#!/bin/sh
case "$1" in
  ps)
    if [ "${MOCK_NO_CONTAINERS:-false}" != "true" ]; then
      printf '%s\n' test-mongo-container
    fi
    ;;
  inspect)
    case "$*" in
      *State.Health*)
        printf '%s\n' "${MOCK_DB_HEALTH:-healthy}"
        ;;
      *Mounts*)
        printf '%s\n' \
          /data/db=existing-data-volume \
          /data/configdb=existing-config-volume \
          /backups=existing-backup-volume
        ;;
      *)
        cat <<'ENV'
MONGO_INITDB_ROOT_USERNAME=existing-user
MONGO_INITDB_ROOT_PASSWORD=existing-pa$$word#'"quoted"\
ENV
        ;;
    esac
    ;;
  *)
    exit 1
    ;;
esac
EOF
chmod +x "$test_dir/bin/docker"

cat > "$test_dir/missing.env" <<'EOF'
CORS_ALLOWED_ORIGIN=https://bridge.tanenbaum.io
EOF

PATH="$test_dir/bin:$PATH" MONGO_ENV_RESTORE_NO_SUDO=true \
  sh "$restorer" "$test_dir/missing.env" "$test_dir/compose"
cat > "$test_dir/expected-password-line" <<'EOF'
MONGO_ROOT_PASSWORD="existing-pa$$$$word#'\"quoted\"\\"
EOF
grep -Fxq 'MONGO_ROOT_USER="existing-user"' "$test_dir/missing.env"
grep -Fqxf "$test_dir/expected-password-line" "$test_dir/missing.env"
grep -Fxq 'MONGO_DATA_VOLUME="existing-data-volume"' \
  "$test_dir/missing.env"
grep -Fxq 'MONGO_CONFIG_VOLUME="existing-config-volume"' \
  "$test_dir/missing.env"
grep -Fxq 'MONGO_BACKUP_VOLUME="existing-backup-volume"' \
  "$test_dir/missing.env"
if grep -q '^MONGODB_URI=' "$test_dir/missing.env"; then
  echo "restorer unexpectedly added a duplicated MongoDB URI" >&2
  exit 1
fi

cat > "$test_dir/existing.env" <<'EOF'
MONGO_ROOT_USER=stale-user
MONGO_ROOT_PASSWORD=stale-password
MONGO_DATA_VOLUME=stale-data-volume
MONGO_CONFIG_VOLUME=stale-config-volume
MONGO_BACKUP_VOLUME=stale-backup-volume
EOF

PATH="$test_dir/bin:$PATH" MONGO_ENV_RESTORE_NO_SUDO=true \
  sh "$restorer" "$test_dir/existing.env" "$test_dir/compose"
grep -Fxq 'MONGO_ROOT_USER="existing-user"' "$test_dir/existing.env"
grep -Fqxf "$test_dir/expected-password-line" "$test_dir/existing.env"
grep -Fxq 'MONGO_DATA_VOLUME="existing-data-volume"' \
  "$test_dir/existing.env"
grep -Fxq 'MONGO_CONFIG_VOLUME="existing-config-volume"' \
  "$test_dir/existing.env"
grep -Fxq 'MONGO_BACKUP_VOLUME="existing-backup-volume"' \
  "$test_dir/existing.env"

compose_file="$script_dir/docker-compose.yaml"
grep -Fq 'name: ${MONGO_DATA_VOLUME:?MONGO_DATA_VOLUME is required}' \
  "$compose_file"
grep -Fq 'name: ${MONGO_CONFIG_VOLUME:?MONGO_CONFIG_VOLUME is required}' \
  "$compose_file"

cat > "$test_dir/bootstrap.env" <<'EOF'
MONGO_ROOT_USER=bootstrap-user
MONGO_ROOT_PASSWORD=bootstrap-password
MONGO_DATA_VOLUME=bootstrap-data
MONGO_CONFIG_VOLUME=bootstrap-config
MONGO_BACKUP_VOLUME=bootstrap-backups
EOF

PATH="$test_dir/bin:$PATH" MONGO_ENV_RESTORE_NO_SUDO=true \
  MOCK_NO_CONTAINERS=true \
  sh "$restorer" "$test_dir/bootstrap.env" "$test_dir/compose"
grep -Fxq 'MONGO_ROOT_USER=bootstrap-user' "$test_dir/bootstrap.env"
grep -Fxq 'MONGO_DATA_VOLUME=bootstrap-data' "$test_dir/bootstrap.env"

cp "$test_dir/existing.env" "$test_dir/unhealthy.env"
if PATH="$test_dir/bin:$PATH" MONGO_ENV_RESTORE_NO_SUDO=true \
  MOCK_DB_HEALTH=unhealthy \
  sh "$restorer" "$test_dir/unhealthy.env" "$test_dir/compose" 2>/dev/null
then
  echo "restorer accepted credentials from an unhealthy Mongo container" >&2
  exit 1
fi
grep -Fxq 'MONGO_ROOT_USER="existing-user"' "$test_dir/unhealthy.env"
