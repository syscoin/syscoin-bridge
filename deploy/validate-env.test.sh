#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
validator="$script_dir/validate-env.sh"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT

cat > "$test_dir/valid.env" <<'EOF'
MONGO_ROOT_USER=user
MONGO_ROOT_PASSWORD=password
MONGO_HOST_PORT=37019
MONGO_DATA_VOLUME=bridge-data
MONGO_CONFIG_VOLUME=bridge-config
MONGO_BACKUP_VOLUME=bridge-backups
BRIDGE_HOST_PORT=4000
CORS_ALLOWED_ORIGIN=https://bridge.tanenbaum.io
SECRET_COOKIE_PASSWORD=at-least-32-characters-long-secret
FOUNDATION_FUNDED=false
EOF

sh "$validator" "$test_dir/valid.env"

sed "s|^CORS_ALLOWED_ORIGIN=.*$|CORS_ALLOWED_ORIGIN=''|" \
  "$test_dir/valid.env" > "$test_dir/quoted-empty.env"
if sh "$validator" "$test_dir/quoted-empty.env" 2>/dev/null; then
  echo "validator accepted a quoted-empty required value" >&2
  exit 1
fi

sed '/^MONGO_ROOT_PASSWORD=/d' "$test_dir/valid.env" > "$test_dir/missing-mongo.env"
if sh "$validator" "$test_dir/missing-mongo.env" 2>/dev/null; then
  echo "validator accepted missing Mongo credentials" >&2
  exit 1
fi

sed '/^MONGO_DATA_VOLUME=/d' "$test_dir/valid.env" > "$test_dir/missing-data-volume.env"
if sh "$validator" "$test_dir/missing-data-volume.env" 2>/dev/null; then
  echo "validator accepted a missing Mongo data volume" >&2
  exit 1
fi

sed '/^SECRET_COOKIE_PASSWORD=/d' "$test_dir/valid.env" > "$test_dir/missing-secret.env"
if sh "$validator" "$test_dir/missing-secret.env" 2>/dev/null; then
  echo "validator accepted a missing transfer authorization secret" >&2
  exit 1
fi

sed 's/^SECRET_COOKIE_PASSWORD=.*$/SECRET_COOKIE_PASSWORD=too-short/' \
  "$test_dir/valid.env" > "$test_dir/short-cookie.env"
if sh "$validator" "$test_dir/short-cookie.env" 2>/dev/null; then
  echo "validator accepted an undersized authorization secret" >&2
  exit 1
fi

cat >> "$test_dir/valid.env" <<'EOF'
NEVM_V2_ACTIVATION_BLOCK=100
NEVM_SPONSOR_PRIVATE_KEY=private-key
UTXO_SPONSOR_ADDRESS=sys-address
UTXO_SPONSOR_WIF=wif
EOF
sed 's/^FOUNDATION_FUNDED=false$/FOUNDATION_FUNDED=true/' \
  "$test_dir/valid.env" > "$test_dir/funded.env"
sh "$validator" "$test_dir/funded.env"

sed "s/^FOUNDATION_FUNDED=false$/FOUNDATION_FUNDED='true'/" \
  "$test_dir/valid.env" > "$test_dir/quoted-funded.env"
sh "$validator" "$test_dir/quoted-funded.env"

sed 's/^FOUNDATION_FUNDED=false$/FOUNDATION_FUNDED="true" # enabled/' \
  "$test_dir/valid.env" > "$test_dir/double-quoted-funded.env"
sh "$validator" "$test_dir/double-quoted-funded.env"

sed '/^NEVM_V2_ACTIVATION_BLOCK=/d' \
  "$test_dir/quoted-funded.env" > "$test_dir/missing-activation.env"
if sh "$validator" "$test_dir/missing-activation.env" 2>/dev/null; then
  echo "validator accepted funded mode without an activation block" >&2
  exit 1
fi
