#!/usr/bin/env bash


# Defaults to dry run unless --execute flag or EXECUTE=1 env var is set
EXECUTE=${EXECUTE:-0}

# Normalize EXECUTE: accept "true"/"false" as well as "1"/"0"
if [ "${EXECUTE}" = "true" ] || [ "${EXECUTE}" = "1" ]; then
  EXECUTE=1
else
  EXECUTE=0
fi

# Parse command line options
while [ $# -gt 0 ]; do
  case "$1" in
    --execute)
      EXECUTE=1
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--execute]  (or set EXECUTE=1 to enable execution)" >&2
      exit 1
      ;;
  esac
  shift
done

HAS_ERROR=0
# Read package name and version from package.json
PACKAGE=$(jq -r .name package.json)
LATEST_VERSION=$(jq -r .version package.json)
if [ -z "$PACKAGE" ] || [ "$PACKAGE" = "null" ]; then
  echo "Error: could not extract package name from package.json" >&2
  exit 1
fi
if [ -z "$LATEST_VERSION" ] || [ "$LATEST_VERSION" = "null" ]; then
  echo "Error: could not extract version from package.json" >&2
  exit 1
fi
echo "Package: $PACKAGE"
echo "Latest version found in package.json: $LATEST_VERSION"
if [ "$EXECUTE" = "0" ]; then
  echo "*** DRY RUN MODE: npm deprecate commands will be printed but not executed ***"
fi
echo ""
DEPRECATED_VERSIONS=()
echo "Fetching pre-release (alpha/beta) versions of homebridge from npm..."
# Fetch all non-deprecated pre-release versions from the registry, pipe directly to jq
# Extract versions as plain list, then sort with sort -V for full semver ordering
PRE_RELEASE_VERSIONS=$(curl -s --compressed -H "accept: application/vnd.npm.install-v1+json" "https://registry.npmjs.org/$PACKAGE" \
  | jq -r '[.versions[] | select(.deprecated == null and (.version | test("-alpha\\.|-beta\\."))) | .version] | .[]' \
  | sort -V \
  | tail -r)
PRE_RELEASE_COUNT=$(echo "$PRE_RELEASE_VERSIONS" | grep -c .)
echo "Found $PRE_RELEASE_COUNT pre-release versions (keeping 5 most recent):"
# Skip the 5 most recent pre-release versions, deprecate the rest
PRE_RELEASE_VERSIONS=$(echo "$PRE_RELEASE_VERSIONS" | tail -n +6)
for VERSION in $PRE_RELEASE_VERSIONS; do
  echo "* Processing version: $VERSION..."
  if [ "$EXECUTE" = "0" ]; then
    echo "* [DRY RUN] Would run: npm deprecate $PACKAGE@\"$VERSION\" \"This pre-release version is deprecated in favor of the latest release.\""
    DEPRECATED_VERSIONS+=("$VERSION")
  elif ! OUTPUT=$(npm deprecate $PACKAGE@"$VERSION" "This pre-release version is deprecated in favor of the latest release." 2>&1); then
    echo "$OUTPUT" >&2
    if echo "$OUTPUT" | grep -q "E429"; then
      echo "* Error: Rate limit exceeded (429). Stopping the step." >&2
      HAS_ERROR=2
      break
    else
      echo "* Error: failed to deprecate version $VERSION" >&2
      HAS_ERROR=1
    fi
  else
    echo "* Deprecated version: $VERSION"
    DEPRECATED_VERSIONS+=("$VERSION")
  fi
done
echo ""
echo ""

# Helper to write to both stdout and, only when running in a GitHub Actions
# workflow context (GITHUB_STEP_SUMMARY is set), also append to the job summary.
summary() {
  echo "$1"
  if [ -n "$GITHUB_STEP_SUMMARY" ]; then
    echo "$1" >> "$GITHUB_STEP_SUMMARY"
  fi
}

summary "## npm Pre-release Deprecation Summary"
if [ "$EXECUTE" = "0" ]; then
  summary "> **DRY RUN MODE** - no versions were actually deprecated."
fi
if [ ${#DEPRECATED_VERSIONS[@]} -eq 0 ]; then
  summary "* No versions were deprecated."
else
  summary "* Deprecated ${#DEPRECATED_VERSIONS[@]} pre-release versions:"
  for VERSION in "${DEPRECATED_VERSIONS[@]}"; do
    summary "  * \`$VERSION\`"
  done
fi
if [ $HAS_ERROR -eq 0 ]; then
  summary "* No versions reported an error while being deprecated."
elif [ $HAS_ERROR -eq 1 ]; then
  summary "* ⚠️ Some versions reported an error while being deprecated - check the logs above."
elif [ $HAS_ERROR -eq 2 ]; then
  summary "* ⚠️ The step stopped early due to a 429 rate limit - retry the action later."
fi

# Exit non-zero in execute mode if any deprecations failed or were rate-limited
if [ "$EXECUTE" = "1" ] && [ $HAS_ERROR -ne 0 ]; then
  exit $HAS_ERROR
fi
