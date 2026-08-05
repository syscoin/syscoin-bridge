#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT

cat > "$test_dir/backend.env" <<'EOF'
MONGO_ROOT_USER=compose-user
MONGO_ROOT_PASSWORD=compose-password
MONGO_APP_DB=bridge
MONGODB_URI=mongodb://stale-user:stale-password@db:27017/bridge?authSource=admin
MONGO_HOST_PORT=47019
MONGO_DATA_VOLUME=compose-data
MONGO_CONFIG_VOLUME=compose-config
MONGO_BACKUP_VOLUME=compose-backups
BRIDGE_HOST_PORT=4000
SECRET_COOKIE_PASSWORD=01234567890123456789012345678901
ADMIN_API_KEY=test-admin-key
EOF

compose_config() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

BRIDGE_ENV_FILE="$test_dir/backend.env" \
  compose_config \
    --env-file "$test_dir/backend.env" \
    -f "$script_dir/docker-compose.yaml" \
    config --format json |
  node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const config = JSON.parse(input);
      const bridge = config.services["syscoin-bridge"].environment;
      if (bridge.MONGODB_URI !== "") {
        throw new Error("Managed Compose retained a stale MongoDB URI");
      }
      if (bridge.MONGO_ROOT_USER !== "compose-user" ||
          bridge.MONGO_ROOT_PASSWORD !== "compose-password") {
        throw new Error("Managed Compose lost the reconciled Mongo credentials");
      }
    });
  '

echo "Docker Compose Mongo configuration tests passed"
