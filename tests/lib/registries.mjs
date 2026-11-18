// Builders for the `http` mocks of package registries, used by scenarios.

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
