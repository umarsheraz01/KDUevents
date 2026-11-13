#!/usr/bin/env bash
# Publishes the student/admin portal to https://portal.kduevents.co.kr
#
# The portal is edited in this project (portal.html, portal.css, portal.js).
# This script copies those files into a small separate site and pushes it to
# the "kdu-portal" GitHub repo, which GitHub Pages serves on the subdomain.
#
# Usage (from the project folder):   bash scripts/deploy-portal.sh
set -euo pipefail

PORTAL_DOMAIN="portal.kduevents.co.kr"
MAIN_SITE="https://kduevents.co.kr/"
PORTAL_REPO="https://github.com/umarsheraz01/kdu-portal.git"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.portal-build"

echo "Building portal site..."
rm -rf "$OUT"
mkdir -p "$OUT"

# Files the portal needs
for f in portal.css portal.js config.js logo.svg kdu-login.jpg; do
  cp "$ROOT/$f" "$OUT/$f"
done

# The portal page becomes the home page of the subdomain.
# Links back to "index.html" (the main site) must point to the main domain.
sed 's#href="index.html"#href="'"$MAIN_SITE"'"#g' "$ROOT/portal.html" > "$OUT/index.html"
cp "$OUT/index.html" "$OUT/404.html"

echo "$PORTAL_DOMAIN" > "$OUT/CNAME"
touch "$OUT/.nojekyll"

# Push the built site to the portal repo
cd "$OUT"
git init -q -b main
git add -A
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" \
  commit -q -m "Publish portal from KDUevents ($(git -C "$ROOT" rev-parse --short HEAD))"
echo "Pushing to $PORTAL_REPO ..."
git push -q --force "$PORTAL_REPO" main
cd "$ROOT"
rm -rf "$OUT"
echo "Done. Live at https://$PORTAL_DOMAIN in about a minute."
