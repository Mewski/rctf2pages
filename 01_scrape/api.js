const util = require('../util.js');

const PAGE_SIZE = 100;

// References to files of the site inside Markdown or HTML content
const CONTENT_REFS = [
  /\b(?:href|src|poster)\s*=\s*["'](?<ref>\/[^"'\s]+)["']/g,
  /\]\(\s*<?(?<ref>\/[^)\s>]+)/g,
];

// Same as countryCodeToFlagFilename in the rCTF frontend
const flagFilename = (countryCode) => {
  const codePoints = countryCode.toUpperCase().split('')
      .map((char) => (char.charCodeAt(0) + 127397).toString(16));
  return `${codePoints.join('-')}.svg`;
};

// Dumps everything the API is willing to tell without logging in to
// api-data/, along with the files the responses refer to.
//
// A static host cannot answer queries, so paginated endpoints are not mirrored
// page by page. They are saved as one dump with every entry instead, which
// the hooks added in a later stage slice up in the browser.
exports.ApiDump = class ApiDump {
  constructor(scraper) {
    this.scraper = scraper;
    this.responses = [];
  }

  async get(apiPath) {
    const url = `${this.scraper.origin}/api${apiPath}`;
    const {ok, status, text} = await this.scraper.limit(async () => {
      const response = await util.fetchRetry(url);
      return {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
      };
    });

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }

    if (!ok || !body) {
      throw new Error(
          `GET ${url}: ${status} ${body?.kind} ${body?.message}`);
    }
    return {text, body};
  }

  // Saves a response where the same path under api-data/ leads to.
  async write(apiPath, body, text) {
    const filepath = util.urlPathToFile(
        this.scraper.basepath, `/api-data${apiPath}.json`);
    await util.writeFile(filepath, text ?? JSON.stringify(body));
    console.log('done:', filepath);

    this.responses.push(body);
  }

  // Saves the response of an endpoint as is.
  async mirror(apiPath) {
    const {text, body} = await this.get(apiPath);
    await this.write(apiPath, body, text);
    return body.data;
  }

  // Every page of a paginated endpoint.
  async pages(apiPath, listKey) {
    const pages = [];

    for (let offset = 0; ;) {
      const {body} = await this.get(
          `${apiPath}?limit=${PAGE_SIZE}&offset=${offset}`);
      const page = body.data;
      pages.push(page);

      offset += page[listKey].length;
      if (!page[listKey].length || offset >= page.total) {
        break;
      }
    }

    return pages;
  }

  async dumpLeaderboard() {
    const pages = await this.pages('/v2/leaderboard/with-graph', 'leaderboard');
    const dump = {
      leaderboard: pages.flatMap((page) => page.leaderboard),
      graph: pages.flatMap((page) => page.graph),
    };

    await this.write('/v2/leaderboard/dump', dump);
    return dump.leaderboard.map((entry) => entry.id);
  }

  async dumpChallenge(chall) {
    const challPath = `/v2/challs/${encodeURIComponent(chall.id)}`;
    const pages = await this.pages(`${challPath}/solves`, 'solves');
    const solves = pages.flatMap((page) => page.solves);
    await this.write(`${challPath}/solves`, {solves});

    const userIds = solves.map((solve) => solve.userId);

    if (chall.scoringKind === 'dynamic') {
      const pages = await this.pages(`${challPath}/scores`, 'scores');
      const scores = pages.flatMap((page) => page.scores);
      const graph = new Map(pages.flatMap((page) => page.graph)
          .map((series) => [series.id, series]));
      await this.write(`${challPath}/scores`,
          {scores, graph: Array.from(graph.values())});

      userIds.push(...scores.map((score) => score.userId));
    }

    return userIds;
  }

  async dumpUser(id) {
    try {
      await this.mirror(`/v2/users/${encodeURIComponent(id)}`);
    } catch (err) {
      // Not having one profile should not stop the archival of the rest
      console.log(`skipped user ${id}:`, err.message);
    }
  }

  // Downloads a file an API response points to with its URL.
  async downloadFile(fileUrl, selfOrigins) {
    let url;
    try {
      url = new URL(fileUrl, this.scraper.origin);
    } catch {
      return;
    }

    let filepath;
    if (selfOrigins.includes(url.origin)) {
      url = new URL(url.pathname + url.search, this.scraper.origin);
      filepath = util.urlPathToFile(this.scraper.basepath, url.pathname);
    } else if (url.protocol === 'http:' || url.protocol === 'https:') {
      filepath = util.urlPathToFile(
          this.scraper.basepath, util.externalUrlPath(fileUrl));
    } else {
      return;
    }

    const file = await this.scraper.download(url, filepath).catch((err) => {
      console.log(err.message);
    });
    if (!file) {
      console.log('missing:', fileUrl);
    }
  }

  async downloadReferenced(config) {
    const files = new Set();
    const refs = new Set();

    for (const response of this.responses) {
      util.walkStrings(response, (value, key) => {
        if (util.isUrlKey(key)) {
          files.add(value);
        } else if (/countryCode$/i.test(key)) {
          refs.add(`/flags/${flagFilename(value)}`);
        } else {
          for (const regex of CONTENT_REFS) {
            for (const match of value.matchAll(regex)) {
              refs.add(match.groups.ref);
            }
          }
        }
      });
    }

    // The site may be scraped at a different address than its public one
    const selfOrigins = [this.scraper.origin, new URL(config.origin).origin];

    await Promise.all([
      ...Array.from(files, (file) => this.downloadFile(file, selfOrigins)),
      ...Array.from(refs, (ref) => this.scraper.crawl(ref)),
    ]);
  }

  async run() {
    const config = await this.mirror('/v2/integrations/client/config');
    const challs = await this.mirror('/v2/challs');
    await this.mirror('/v2/leaderboard/challs');

    const userIds = (await Promise.all([
      this.dumpLeaderboard(),
      ...challs.map((chall) => this.dumpChallenge(chall)),
    ])).flat();

    await Promise.all(Array.from(new Set(userIds), (id) => this.dumpUser(id)));

    await this.downloadReferenced(config);
  }
};
