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
    printf '%s\n' test-mongo-container
    ;;
  inspect)
    case "$*" in
      *Mounts*)
        printf '%s\n' existing-backup-volume
        ;;
      *)
        cat <<'ENV'
MONGO_INITDB_ROOT_USERNAME=existing-user
MONGO_INITDB_ROOT_PASSWORD=existing-pa$$word#'quoted'
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
grep -Fxq "MONGO_ROOT_USER='existing-user'" "$test_dir/missing.env"
grep -Fxq "MONGO_ROOT_PASSWORD='existing-pa\$\$word#\\'quoted\\''" \
  "$test_dir/missing.env"
grep -Fxq "MONGO_BACKUP_VOLUME='existing-backup-volume'" \
  "$test_dir/missing.env"
if grep -q '^MONGODB_URI=' "$test_dir/missing.env"; then
  echo "restorer unexpectedly added a duplicated MongoDB URI" >&2
  exit 1
fi

cat > "$test_dir/existing.env" <<'EOF'
MONGO_ROOT_USER=preserved-user
MONGO_ROOT_PASSWORD=preserved-password
EOF

PATH="$test_dir/bin:$PATH" MONGO_ENV_RESTORE_NO_SUDO=true \
  sh "$restorer" "$test_dir/existing.env" "$test_dir/compose"
grep -Fxq 'MONGO_ROOT_USER=preserved-user' "$test_dir/existing.env"
grep -Fxq 'MONGO_ROOT_PASSWORD=preserved-password' "$test_dir/existing.env"
