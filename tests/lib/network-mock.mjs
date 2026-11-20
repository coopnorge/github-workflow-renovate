// Loaded into the Renovate process (inside the Renovate container) with
// `node --import`. It replaces the network with canned data, so tests run
// offline and give the same result every time:
//
// - Preset files of coopnorge/github-workflow-renovate are served from the
//   version under test (passed in by the harness), not from GitHub.
// - The GraphQL and REST endpoints used by the github-tags, github-digest and
//   github-releases datasources return the repos in the scenario's `github`.
// - Any other URL in the scenario's `http` (package registries such as PyPI)
//   returns the given response.
//
// Other api.github.com requests get a 404. Connections to any other host fail,
// except to the Gitea test instance. Both are reported to the harness, so that
// missing mocks are easy to spot.
import { readFileSync } from 'node:fs';
import nock from 'nock';

const PRESET_REPO = 'coopnorge/github-workflow-renovate';

const mock = JSON.parse(readFileSync(process.env.RENOVATE_TEST_MOCK_FILE, 'utf8'));
// Renovate logs to stdout. The harness reads these lines from stderr.
function recordUnmatched(method, url) {
  process.stderr.write(`renovate-test: unmatched request: ${method} ${url}\n`);
}

function byDateDesc(a, b) {
  return b.date.localeCompare(a.date);
}

function commitNode(ref) {
  return {
    version: ref.name,
    target: { type: 'Commit', oid: ref.sha, releaseTimestamp: ref.date },
  };
}

function graphqlPayload(query, repo) {
  if (query.includes('refPrefix: "refs/tags/"')) {
    return [...(repo.tags ?? [])].sort(byDateDesc).map(commitNode);
  }
  if (query.includes('refPrefix: "refs/heads/"')) {
    return (repo.branches ?? []).map(commitNode);
  }
  if (query.includes('releases(')) {
    return (repo.releases ?? []).map((release, index) => ({
      version: release.name,
      releaseTimestamp: release.date,
      isDraft: false,
      isPrerelease: release.prerelease ?? false,
      url: `https://github.com/${repo.fullName}/releases/tag/${release.name}`,
      id: index + 1,
      name: release.name,
      description: release.body ?? '',
    }));
  }
  return null;
}

const allowedHosts = new Set(mock.allowedHosts);
const isAllowed = (host) => allowedHosts.has(String(host).replace(/:\d+$/, ''));

nock.disableNetConnect();
nock.enableNetConnect(isAllowed);

// `http`: { '[METHOD ]https://host/path?query': body | { status, headers, body } }, METHOD defaults to GET
for (const [key, response] of Object.entries(mock.http ?? {})) {
  const [, method = 'GET', url] = key.match(/^(?:([A-Z]+) )?(.+)$/);
  const { origin, pathname, search } = new URL(url);
  const isFull = response !== null && typeof response === 'object' && 'body' in response;
  const { status = 200, headers = {}, body } = isFull ? response : { body: response };
  const contentType = typeof body === 'string' ? 'text/plain' : 'application/json';
  nock(origin).persist().intercept(pathname + search, method)
    .reply(status, typeof body === 'string' ? body : JSON.stringify(body), { 'content-type': contentType, ...headers });
}

// Like GitHub for private coopnorge repositories, only answer requests that use
// the token renovate.yaml gives Renovate. Others fail and are reported.
const api = nock('https://api.github.com', {
  reqheaders: { authorization: (value) => String(value).includes(mock.githubToken) },
}).persist();

api
  .get(new RegExp(`^/repos/${PRESET_REPO}/contents/([^?]+)`))
  .reply((uri) => {
    const file = decodeURIComponent(new URL(uri, 'https://api.github.com').pathname)
      .replace(`/repos/${PRESET_REPO}/contents/`, '');
    const content = mock.presets[file];
    if (content === undefined) {
      return [404, { message: 'Not Found' }];
    }
    return [200, {
      name: file.split('/').pop(),
      path: file,
      type: 'file',
      encoding: 'base64',
      content: Buffer.from(content).toString('base64'),
    }];
  });

api.post('/graphql').reply((uri, body) => {
  const { owner, name } = body.variables ?? {};
  const fullName = `${owner}/${name}`;
  const repo = mock.repos[fullName];
  if (!repo) {
    recordUnmatched('POST', `/graphql repository=${fullName}`);
    return [200, {
      data: { repository: null },
      errors: [{
        type: 'NOT_FOUND',
        message: `Could not resolve to a Repository with the name '${fullName}'.`,
      }],
    }];
  }
  const nodes = graphqlPayload(body.query, { ...repo, fullName });
  if (nodes === null) {
    recordUnmatched('POST', `/graphql repository=${fullName} (unknown query)`);
    return [200, { errors: [{ message: 'Unsupported query in test mock' }] }];
  }
  return [200, {
    data: {
      repository: {
        isRepoPrivate: false,
        payload: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
      },
    },
  }];
});

api
  .get(/^\/repos\/[^/]+\/[^/]+$/)
  .reply((uri) => {
    const fullName = uri.split('/').slice(2, 4).join('/');
    const repo = mock.repos[fullName];
    if (!repo) {
      recordUnmatched('GET', uri);
      return [404, { message: 'Not Found' }];
    }
    return [200, {
      name: fullName.split('/')[1],
      full_name: fullName,
      owner: { login: fullName.split('/')[0] },
      private: false,
      html_url: `https://github.com/${fullName}`,
      default_branch: repo.defaultBranch ?? 'main',
    }];
  });

api
  .get(/^\/repos\/[^/]+\/[^/]+\/git\/trees\/[^/?]+(\?.*)?$/)
  .reply((uri) => {
    const fullName = uri.split('/').slice(2, 4).join('/');
    if (!mock.repos[fullName]) {
      recordUnmatched('GET', uri);
      return [404, { message: 'Not Found' }];
    }
    // No changelog files: release notes come from the releases in the scenario.
    return [200, { sha: '0'.repeat(40), tree: [], truncated: false }];
  });

api
  .get(/^\/repos\/[^/]+\/[^/]+\/commits\?per_page=1$/)
  .reply((uri) => {
    const [, owner, name] = uri.split('?')[0].split('/').slice(1);
    const repo = mock.repos[`${owner}/${name}`];
    const head = repo?.branches?.find((b) => b.name === (repo.defaultBranch ?? 'main'));
    if (!head) {
      recordUnmatched('GET', uri);
      return [404, { message: 'Not Found' }];
    }
    return [200, [{ sha: head.sha }]];
  });

for (const method of ['get', 'post', 'head']) {
  api[method](/.*/).reply((uri) => {
    recordUnmatched(method.toUpperCase(), uri);
    return [404, { message: 'Not Found (test mock)' }];
  });
}

nock.emitter.on('no match', (req) => {
  const host = req.hostname ?? req.host ?? req.options?.hostname;
  if (!isAllowed(host)) {
    const headers = req.headers ?? req.options?.headers ?? {};
    const auth = Object.entries(headers).find(([key]) => key.toLowerCase() === 'authorization')?.[1];
    const note = host === 'api.github.com' && !String(auth ?? '').includes(mock.githubToken)
      ? ' (without the GitHub token from renovate.yaml)'
      : '';
    recordUnmatched(req.method ?? 'GET', `${req.protocol ?? 'https:'}//${host}${req.path ?? ''}${note}`);
  }
});
