const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const util = require('../util.js');
const {ApiDump} = require('./api.js');

// rCTF's frontend is a single page app, there are no pages to walk through.
// Start from these and follow every reference to another file instead.
const SEEDS = [
  '/',
  '/_app/version.json',
  '/favicon.ico',
  '/robots.txt',
];

const ASSET_EXTENSIONS = [
  'js', 'mjs', 'css', 'json', 'webmanifest', 'wasm', 'txt', 'xml', 'pdf',
  'svg', 'png', 'jpe?g', 'gif', 'webp', 'avif', 'ico',
  'woff2?', 'ttf', 'otf', 'eot',
  'mp3', 'ogg', 'wav', 'mp4', 'webm',
].join('|');

const HTML_REFS = [
  /\b(?:href|src)\s*=\s*["'](?<ref>[^"']+)["']/g,
  /\bimport\(\s*["'](?<ref>[^"']+)["']\s*\)/g,
];
const JS_REFS = [
  // Any string that looks like the path of a file, such as the imports of
  // other chunks and Vite's preload lists.
  new RegExp('["\'`](?<ref>(?:\\.{0,2}/|_app/)[^"\'`\\s\\\\${}]*?' +
      `\\.(?:${ASSET_EXTENSIONS}))["'\`]`, 'g'),
  /new URL\(\s*["'`](?<ref>[^"'`]+)["'`]\s*,\s*import\.meta\.url/g,
];
const CSS_REFS = [
  /url\(\s*["']?(?<ref>[^"')\s]+)["']?\s*\)/g,
  /@import\s+["'](?<ref>[^"']+)["']/g,
];
const MANIFEST_REFS = [
  /"src"\s*:\s*"(?<ref>[^"]+)"/g,
];

// How to find the references in a file, if it is of a kind that has any. Not
// every file is served with the content type one would expect.
const refRegexes = (url, type) => {
  if (type.includes('text/html')) {
    return HTML_REFS;
  } else if (type.includes('javascript') || /\.m?js$/.test(url.pathname)) {
    return JS_REFS;
  } else if (type.includes('text/css') || url.pathname.endsWith('.css')) {
    return CSS_REFS;
  } else if (url.pathname.endsWith('.webmanifest')) {
    return MANIFEST_REFS;
  } else {
    return undefined;
  }
};

class Scraper {
  constructor(origin, basepath) {
    this.origin = origin;
    this.basepath = basepath;

    this.limit = util.limiter(8);
    this.downloads = new Map();
    this.crawled = new Set();
  }

  // The URL a reference points to, if it is on the scraped site.
  resolve(ref, base) {
    let url;
    try {
      url = new URL(ref, base || this.origin);
    } catch {
      return undefined;
    }

    if (url.origin !== this.origin) {
      return undefined;
    }
    url.hash = '';
    return url;
  }

  // Downloads an URL to a file, once. Resolves to undefined if there is no
  // such file on the server.
  download(url, filepath) {
    if (!this.downloads.has(filepath)) {
      this.downloads.set(filepath, this.limit(async () => {
        const response = await util.fetchRetry(url);
        if (!response.ok) {
          return undefined;
        }

        const type = response.headers.get('content-type') || '';
        // The server answers with the app instead of a 404 for files it does
        // not have, except for uploads.
        if (url.origin === this.origin && type.includes('text/html') &&
            url.pathname !== '/' && !url.pathname.startsWith('/uploads/')) {
          return undefined;
        }

        const body = Buffer.from(await response.arrayBuffer());
        await util.writeFile(filepath, body);
        console.log('done:', filepath);

        const isText = refRegexes(url, type) !== undefined;
        return {type, text: isText ? body.toString('utf8') : undefined};
      }));
    }

    return this.downloads.get(filepath);
  }

  // Downloads a file of the site, and every file it refers to.
  async crawl(ref, base) {
    const url = this.resolve(ref, base);
    if (!url || url.pathname.startsWith('/api/') ||
        this.crawled.has(url.pathname)) {
      return;
    }
    this.crawled.add(url.pathname);

    let filepath;
    try {
      filepath = util.urlPathToFile(this.basepath, url.pathname);
    } catch {
      // Not every string that looks like a path is one
      return;
    }

    const asset = await this.download(url, filepath);
    if (!asset?.text) {
      return;
    }

    const refs = refRegexes(url, asset.type).flatMap((regex) =>
      Array.from(asset.text.matchAll(regex), (match) => match.groups.ref));
    await Promise.all(refs.map((found) => this.crawl(found, url)));
  }

  async run() {
    await Promise.all(SEEDS.map((seed) => this.crawl(seed)));
    assert(fs.existsSync(path.join(this.basepath, 'index.html')),
        `${this.origin} has no index page`);
    assert(fs.existsSync(path.join(this.basepath, '_app')),
        `${this.origin} does not look like rCTF, there is no /_app`);

    await new ApiDump(this).run();
  }
}

const main = async function() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error(
        `Usage: ${process.argv[0]} ${process.argv[1]} [origin] [path]`);
    console.error(
        `Example: ${process.argv[0]} ${process.argv[1]} https://rctf.teamctf.com rctf-pages/`);
    return 1;
  }

  const [origin, basepath] = args;
  await new Scraper(new URL(origin).origin, path.resolve(basepath)).run();

  return 0;
};

if (require.main === module) {
  main().then(process.exit);
}
