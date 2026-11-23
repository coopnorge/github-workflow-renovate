// Builders for the `http` mocks of Docker Hub, used by scenarios.
import { createHash } from 'node:crypto';

/** Deterministic fake image digest (`sha256:...`), so expectations can refer to it by label. */
export function imageDigest(label) {
  return `sha256:${createHash('sha256').update(label).digest('hex')}`;
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
