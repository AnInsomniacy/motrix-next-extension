# Releasing Rayburst Connect

Release this repository independently. Local builds do not submit to browser
stores. Publishing a GitHub Release and submitting to stores are separate actions;
perform only the distribution steps the maintainer has authorized.

## Version policy

`package.json` owns the version. Use `bash scripts/bump-version.sh <version>`;
[WXT derives the browser manifest](https://wxt.dev/guide/essentials/config/manifest.html)
at build time. Never edit generated manifests or package a manually patched output
directory. Git tags use `v<version>`; the package version has no `v` prefix.

Follow [SemVer](https://semver.org/): patch for compatible fixes, minor for compatible
features, major for breaking public contracts. Document changes to desktop API
requirements, browser behavior or saved configuration that need user action.

| Release           | Version                                       | GitHub prerelease | Store workflow                   |
| ----------------- | --------------------------------------------- | ----------------- | -------------------------------- |
| Stable            | `X.Y.Z`                                       | No                | Eligible for separate submission |
| Alpha / beta / RC | `X.Y.Z-alpha.N`, `X.Y.Z-beta.N`, `X.Y.Z-rc.N` | Yes               | Rejected                         |

Use lowercase suffixes and positive counters without leading zeros. For an
authorized release without an explicit target, continue the current channel and
choose the increment from the changes. Do not silently promote to stable. Follow
an explicit maintainer version or channel request.

Inspect the generated `version` and, on Chromium, `version_name` before distribution.
Git prerelease labels and browser version ordering are different concerns; let WXT
perform the conversion. Store submissions use stable `X.Y.Z` versions through the
existing production-release resolver.

## GitHub release

Use the pinned pnpm version. Run Bash scripts from this repository's root, including
Git Bash on Windows. Stay on the current branch.

1. Finish the source changes. Review the diff, remote and local tags; verify the
   proposed tag is unused remotely. Confirm all staged and unstaged work belongs
   in the release.
2. Run the checks in [Contributing](CONTRIBUTING.md) and `pnpm test`. Build both
   browsers; inspect manifest names, versions, permissions, native-host identity
   and generated icons. The maintainer performs real browser/desktop acceptance.
   Honor task-specific static-only limits and state which checks were not performed.
3. Run `bash scripts/bump-version.sh <version>`, review the manifest change and
   prepare English release notes from the previous release's tag.
4. When publication is authorized, run `bash scripts/release.sh`. It formats,
   validates and packages both browsers before staging **all** changes, committing
   if needed, creating an annotated tag and pushing the branch and **all local tags**.
   Inspect that scope first. It does not create the GitHub Release.
5. Confirm CI passed for the tagged commit. Publish a GitHub Release for that tag
   and set the prerelease flag correctly. The Release workflow runs its quality
   gate, builds both browser packages and attaches them.

[release.yml](../.github/workflows/release.yml) also supports manual dispatch for
the selected ref. Manual builds retain Actions artifacts for 30 days and do not
publish a GitHub Release or submit to stores. A tag push alone does not trigger
packaging. Expected packages are:

- `rayburst-connect-<version>-chromium-mv3.zip`
- `rayburst-connect-<version>-firefox-mv3.zip`

Each repository owns its tests, fixtures and builds. Do not create cross-repository
tests or require a shared parent workspace.

## Store submission

Rayburst Connect's store identity and listing must be reviewed before its first
submission. The existing Chromium public key and Firefox installation ID are
retained local/native-host identities; a branding change does not authorize
replacing them or updating an existing store listing. Local copy lives in
[listing.md](store/listing.md) and [permissions.md](store/permissions.md).

Manually dispatch [Publish to Stores](../.github/workflows/publish.yml) with an
explicit production version, its `v` tag, or `latest`. The resolver rejects
prereleases. The workflow submits to all three configured stores; it has no
single-store selector. Confirm the intended destinations before dispatch.

The workflow takes release source from the resolved tag and automation from `main`.
It runs the quality gate again, rebuilds packages, then uses Chrome Web Store API v2,
Mozilla's `web-ext sign --channel listed`, and Edge Add-ons API v1. Firefox also
receives a source archive from the release commit. These are actual store submissions,
not local signing checks.

Configure the following repository values for the chosen destinations:

| Store   | Secrets                                                                                   | Variables                                      |
| ------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Chrome  | `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` | `CHROME_PUBLISHER_ID`                          |
| Firefox | `FIREFOX_API_KEY`, `FIREFOX_API_SECRET`                                                   | `FIREFOX_ADDON_SLUG`                           |
| Edge    | `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`                                       | `EDGE_EXTENSION_ID` for the public status link |

The Edge publisher records `EDGE_LAST_OPERATION_ID`, `EDGE_LAST_OPERATION_VERSION`,
`EDGE_LAST_OPERATION_RUN_ID` and `EDGE_LAST_OPERATION_SUBMITTED_AT`. If the default
token cannot write repository variables, configure `REPO_VARIABLES_TOKEN` with
access to this repository's Actions variables. A missing saved operation is
reported separately from submission success.

Read the publish summary, then run
[Store Release Status](../.github/workflows/store-status.yml) for the same version.
A green job can mean a submitted package, pending review, an existing version or
a skipped submission. Report each store's submitted and public versions separately;
do not translate workflow success into “live in all stores.”

## Release notes and retry policy

Use an English title such as `v<version> — <specific change>`. Describe the observable
behavior, required desktop version when relevant, breaking changes and known
limitations. Changed and Fixed sections are optional; omit empty sections and
unsupported claims. Distinguish GitHub packages from approved store availability.
Do not promote another project or paste commit logs as release notes. For manual
publication, provide title and body in separate code blocks.

Retry infrastructure failures from the same source. Check existing submissions
before retrying a store operation; pending review is not a reason to bump a version.
Changed package content needs a new version and tag. Do not delete published tags
or reuse distributed versions. Ship a rollback as a higher version containing the
revert, and verify the generated browser version advances from the submitted build.
