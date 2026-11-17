// The frontend of rCTF expects an API to talk to, and what remains of it is
// a pile of JSON files in /api-data. Answer the API requests of the frontend
// here in the browser, from those files.
//
// Follows the idea of the fetch interceptor of `rctf export`:
// https://github.com/otter-sec/rctf

(() => {
  const nativeFetch = window.fetch;
  const files = new Map();

  const respond = (body, status = 200) => {
    return new Response(JSON.stringify(body), {
      status,
      headers: {'Content-Type': 'application/json'},
    });
  };

  const notArchived = () => respond({
    kind: 'badEndpoint',
    message: 'Not available in the archive.',
    data: null,
  }, 404);

  // The content of a JSON file of the archive, null if there is no such file.
  const load = (path) => {
    if (!files.has(path)) {
      files.set(path, nativeFetch(path).then((response) => {
        const type = response.headers.get('content-type') || '';
        return response.ok && type.includes('json') ? response.json() : null;
      }).catch((err) => {
        // Let the next request try again
        files.delete(path);
        throw err;
      }));
    }

    return files.get(path);
  };

  const paginate = (list, params) => {
    const offset = parseInt(params.get('offset') || '0', 10);
    const limit = parseInt(params.get('limit') || '100', 10);
    return list.slice(offset, offset + limit);
  };

  // The teams of the leaderboard a request asks for, in the order the API
  // would list them.
  const filterTeams = (teams, params) => {
    const division = params.get('division');
    const search = (params.get('search') || '').toLowerCase();
    const challenge = params.get('challenge');

    if (division) {
      teams = teams.filter((team) => team.division === division);
    }
    if (search) {
      teams = teams.filter((team) => team.name.toLowerCase().includes(search));
    }
    if (challenge) {
      const solveTime = (team) =>
        team.solves.find((solve) => solve.id === challenge)?.solveTime;
      const points = (team) =>
        team.dynamicScores.find((score) => score.id === challenge)?.points;

      // Best score first for dynamic scoring, else first solve first
      teams = teams
          .filter((team) => (solveTime(team) ?? points(team)) !== undefined)
          .sort((a, b) => (points(b) ?? 0) - (points(a) ?? 0) ||
              (solveTime(a) ?? Infinity) - (solveTime(b) ?? Infinity));
    }

    return teams;
  };

  const leaderboard = async (params) => {
    const dump = await load('/api-data/v2/leaderboard/dump.json');
    if (!dump) {
      return null;
    }

    const teams = filterTeams(dump.leaderboard, params);
    const page = paginate(teams, params);
    const graphs = new Map(dump.graph.map((series) => [series.id, series]));

    return {
      total: teams.length,
      leaderboard: page,
      graph: page.map((team) => graphs.get(team.id)).filter(Boolean),
    };
  };

  const routes = [
    [/^\/api\/v2\/leaderboard\/with-graph$/, async (params) => {
      const data = await leaderboard(params);
      return data ? respond({
        kind: 'goodLeaderboardWithGraph',
        message: 'The leaderboard with graph was retrieved.',
        data,
      }) : notArchived();
    }],

    [/^\/api\/v2\/leaderboard\/now$/, async (params) => {
      const data = await leaderboard(params);
      return data ? respond({
        kind: 'goodLeaderboardV2',
        message: 'The leaderboard was retrieved.',
        data: {total: data.total, leaderboard: data.leaderboard},
      }) : notArchived();
    }],

    [/^\/api\/v2\/leaderboard\/graph$/, async (params) => {
      const data = await leaderboard(params);
      return data ? respond({
        kind: 'goodLeaderboardGraph',
        message: 'The leaderboard graph was retrieved.',
        data: {graph: data.graph},
      }) : notArchived();
    }],

    [/^\/api\/v2\/challs\/([^/]+)\/solves$/, async (params, id) => {
      const dump = await load(`/api-data/v2/challs/${id}/solves.json`);
      return dump ? respond({
        kind: 'goodChallengeSolvesV2',
        message: 'The challenges solves have been retrieved.',
        data: {
          solves: paginate(dump.solves, params),
          total: dump.solves.length,
          mySolvePosition: null,
        },
      }) : notArchived();
    }],

    [/^\/api\/v2\/challs\/([^/]+)\/scores$/, async (params, id) => {
      // Only challenges with dynamic scoring have scores
      const dump = await load(`/api-data/v2/challs/${id}/scores.json`) ||
          {scores: [], graph: []};
      const page = paginate(dump.scores, params);
      const userIds = new Set(page.map((score) => score.userId));

      return respond({
        kind: 'goodChallengeScoresV2',
        message: 'The challenge scores have been retrieved.',
        data: {
          scores: page,
          graph: dump.graph.filter((series) => userIds.has(series.id)),
          total: dump.scores.length,
          myPosition: null,
        },
      });
    }],

    // Nobody is logged in to an archive
    [/^\/api\/v2\/users\/me$/, async () => respond({
      kind: 'badToken',
      message: 'The token provided is invalid.',
      data: null,
    }, 401)],

    // The rest was saved as is
    [/^\/api(\/.+)$/, async (params, path) => {
      const body = await load(`/api-data${path}.json`);
      return body ? respond(body) : notArchived();
    }],
  ];

  window.fetch = function(input, init) {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request ? request.url : String(input), location.href);

    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) {
      return nativeFetch.call(this, input, init);
    }

    const method = init?.method || request?.method || 'GET';
    if (method.toUpperCase() !== 'GET') {
      return Promise.resolve(respond({
        kind: 'badEndpoint',
        message: 'This is a read-only archive.',
        data: null,
      }, 405));
    }

    for (const [regex, handler] of routes) {
      const match = url.pathname.match(regex);
      if (match) {
        return handler(url.searchParams, ...match.slice(1));
      }
    }
    return Promise.resolve(notArchived());
  };
})();
