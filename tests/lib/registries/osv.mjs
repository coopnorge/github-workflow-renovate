// Builders for the `osv` advisories of scenarios.

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
