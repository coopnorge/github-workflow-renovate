// Builders for the `http` mocks of package registries, used by scenarios.
import { createHash } from 'node:crypto';

/** Deterministic fake image digest (`sha256:...`), so expectations can refer to it by label. */
export function imageDigest(label) {
  return `sha256:${createHash('sha256').update(label).digest('hex')}`;
}

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
 * Docker Hub responses for an official image (`library/<image>`), as used by
 * Renovate's docker datasource. Docker Hub dates a tag by when it was last
 * pushed, not by when the version was released. Every tag is a multi-arch image,
 * so Renovate takes the new digest from the Docker Hub tag list.
 *
 * @param {string} image image name, such as `golang`
 * @param {Record<string, { pushed: string, digest: string }>} tags tag -> last
 *   push time (ISO timestamp) and digest of the image index
 */
export function dockerHubImage(image, tags) {
  const repository = `library/${image}`;
  const registry = `https://index.docker.io/v2/${repository}`;
  const results = Object.entries(tags)
    .map(([name, { pushed, digest }], index) => ({
      id: index + 1,
      name,
      last_updated: pushed,
      tag_last_pushed: pushed,
      digest,
      images: [{ architecture: 'amd64', digest: imageDigest(`${image}:${name}/amd64`) }],
    }))
    .sort((a, b) => b.last_updated.localeCompare(a.last_updated));
  return {
    'https://index.docker.io/v2/': {},
    [`https://hub.docker.com/v2/repositories/${repository}/tags?page_size=1000&ordering=last_updated`]:
      { count: results.length, next: null, results },
    ...Object.fromEntries(Object.entries(tags).flatMap(([name, { digest }]) => [
      [`HEAD ${registry}/manifests/${digest}`, {
        headers: { 'content-type': 'application/vnd.oci.image.index.v1+json', 'docker-content-digest': digest },
        body: '',
      }],
      // No image labels, so no source repository and no release notes.
      [`${registry}/manifests/${name}`, { status: 404, body: { errors: [{ code: 'MANIFEST_UNKNOWN' }] } }],
    ])),
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
