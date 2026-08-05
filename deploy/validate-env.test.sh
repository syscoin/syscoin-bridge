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
MONGO_BACKUP_VOLUME=bridge-backups
BRIDGE_HOST_PORT=4000
CORS_ALLOWED_ORIGIN=https://bridge.tanenbaum.io
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

cat >> "$test_dir/valid.env" <<'EOF'
ADMIN_API_KEY=admin-key
EOF
if sh "$validator" "$test_dir/valid.env" 2>/dev/null; then
  echo "validator accepted admin auth without a cookie secret" >&2
  exit 1
fi

cp "$test_dir/valid.env" "$test_dir/short-cookie.env"
cat >> "$test_dir/short-cookie.env" <<'EOF'
SECRET_COOKIE_PASSWORD=too-short
EOF
if sh "$validator" "$test_dir/short-cookie.env" 2>/dev/null; then
  echo "validator accepted an undersized cookie secret" >&2
  exit 1
fi

cat >> "$test_dir/valid.env" <<'EOF'
SECRET_COOKIE_PASSWORD=at-least-32-characters-long-secret
EOF
sh "$validator" "$test_dir/valid.env"

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
