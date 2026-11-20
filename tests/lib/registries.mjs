// Builders for the `http` mocks of package registries, used by scenarios.

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

/**
 * PyPI JSON API response for `name`, as used by Renovate's pypi datasource.
 *
 * @param {string} name package name
 * @param {Record<string, string>} versions version -> upload time (ISO timestamp)
 */
export function pypi(name, versions) {
  const normalized = name.toLowerCase().replace(/[-_.]+/g, '-');
  return {
    [`https://pypi.org/pypi/${normalized}/json`]: {
      info: { name, home_page: null, project_urls: null },
      releases: Object.fromEntries(Object.entries(versions).map(([version, date]) => [
        version,
        [{ filename: `${normalized}-${version}.tar.gz`, upload_time_iso_8601: date, upload_time: date, yanked: false }],
      ])),
    },
  };
}

/**
 * OSV advisory for the scenario's `osv`, for Renovate's osvVulnerabilityAlerts.
 *
 * @param {{ id: string, ecosystem: string, name: string, fixed: string, published: string }} advisory
 *   `name` is affected below version `fixed`
 */
export function osvAdvisory({ id, ecosystem, name, fixed, published }) {
  const purlType = { Go: 'golang', PyPI: 'pypi', npm: 'npm' }[ecosystem];
  return {
    schema_version: '1.6.0',
    id,
    modified: published,
    published,
    summary: `Test advisory for ${name}`,
    details: `Test advisory for ${name}, fixed in ${fixed}.`,
    affected: [{
      package: { ecosystem, name, purl: `pkg:${purlType}/${name}` },
      ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed }] }],
    }],
    database_specific: { severity: 'HIGH' },
  };
}
