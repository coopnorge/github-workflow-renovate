// Builders for the `http` mocks of Go registries (go.dev release history and
// the Go module proxy), used by scenarios.

/**
 * Go release history, as used by Renovate's golang-version datasource (the
 * `go` directive in go.mod). Like go.dev, it only has the release day.
 *
 * @param {Record<string, string>} versions version (`1.27.3`) -> release time (ISO timestamp)
 */
export function golangReleases(versions) {
  const releases = Object.entries(versions).reverse().map(([version, date]) => {
    const [year, month, day] = date.slice(0, 10).split('-').map(Number);
    return `\t{\n\t\tDate: Date{${year}, ${month}, ${day}}, Version: Version{${version.split('.').join(', ')}},\n\t},`;
  });
  return {
    'https://raw.githubusercontent.com/golang/website/HEAD/internal/history/release.go':
      `package history\n\nvar Releases = []*Release{\n${releases.join('\n')}\n}\n`,
  };
}

/**
 * Go module proxy (proxy.golang.org) responses for `module`, as used by
 * Renovate's go datasource. The next major version (`/v2`) doesn't exist.
 * Renovate finds the source repository from the `go-import` meta tag at
 * `https://<module>?go-get=1`, like the go command does.
 *
 * @param {string} module module path, in lower case
 * @param {Record<string, string>} versions version -> release time (ISO timestamp)
 * @param {{ importRoot?: string, repo: string }} source module path of the
 *   repository root (defaults to `module`), and the GitHub repository (`owner/name`)
 */
export function goproxy(module, versions, { importRoot = module, repo }) {
  const base = `https://proxy.golang.org/${module}`;
  const latest = Object.keys(versions).at(-1);
  const info = (version) => ({ Version: version, Time: versions[version] });
  const goImport = `<html><head><meta name="go-import" content="${importRoot} git https://github.com/${repo}"></head></html>`;
  return {
    [`${base}/@v/list`]: `${Object.keys(versions).join('\n')}\n`,
    [`${base}/@latest`]: info(latest),
    ...Object.fromEntries(Object.keys(versions).map((v) => [`${base}/@v/${v}.info`, info(v)])),
    [`${base}/v2/@v/list`]: { status: 404, body: 'not found' },
    [`https://${module}?go-get=1`]: { body: goImport, headers: { 'content-type': 'text/html' } },
  };
}
