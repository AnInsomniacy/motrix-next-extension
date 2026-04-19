#!/usr/bin/env bash
# ==============================================================================
# bump-version.sh — Atomic version bump for package.json
#
# Usage:
#   ./scripts/bump-version.sh 1.0.6
#
# This ONLY bumps the version number. Use ./scripts/release.sh to commit, tag,
# and push when you are ready to publish.
# ==============================================================================
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.0.6"
  exit 1
fi

VERSION="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE_JSON="$PROJECT_ROOT/package.json"

# Validate version format (SemVer with optional pre-release)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "Error: Invalid version format '$VERSION'"
  echo "Expected: MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-prerelease"
  exit 1
fi

# Update package.json
cd "$PROJECT_ROOT"
npm pkg set "version=$VERSION"

echo "✓ Bumped version to $VERSION"
echo "  - $PACKAGE_JSON"
echo ""
echo "When ready to release, run: ./scripts/release.sh"
