const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const USER_AGENT = 'rctf2pages';

const sleep = (timeout) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
};

// Returns a function that runs async tasks, at most `concurrency` at a time.
exports.limiter = (concurrency) => {
  let active = 0;
  const waiting = [];

  return async (task) => {
    if (active < concurrency) {
      active++;
    } else {
      // The finishing task hands its slot over to us.
      await new Promise((resolve) => waiting.push(resolve));
    }

    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) {
        next();
      } else {
        active--;
      }
    }
  };
};

// fetch() that retries network errors, rate limits and server errors.
exports.fetchRetry = async (url, retries = 5) => {
  for (let attempt = 0; ; attempt++) {
    let delay = 1000 * 2 ** attempt;
    let response;

    try {
      response = await fetch(url, {headers: {'User-Agent': USER_AGENT}});
    } catch (err) {
      if (attempt >= retries) {
        throw err;
      }
    }

    if (response) {
      if (response.status !== 429 && response.status < 500) {
        return response;
      }
      if (attempt >= retries) {
        return response;
      }

      if (response.status === 429) {
        // rCTF says how long to wait in the body of badRateLimit
        const body = await response.json().catch(() => null);
        const retryAfter = Number(response.headers.get('retry-after'));
        delay = body?.data?.timeLeft || retryAfter * 1000 || delay;
      }
    }

    console.log(`retry in ${delay}ms:`, String(url));
    await sleep(delay);
  }
};

// Where the file for a URL path lives in the pages repo.
exports.urlPathToFile = (basepath, urlPath) => {
  let relative = decodeURIComponent(urlPath);
  if (relative.endsWith('/')) {
    relative += 'index.html';
  }

  const filepath = path.resolve(basepath, `./${relative}`);
  // The paths come from the remote site, don't let them escape the repo.
  assert(filepath.startsWith(path.resolve(basepath) + path.sep),
      `Path escapes the pages repo: ${urlPath}`);
  return filepath;
};

// Where the local copy of a file hosted on another origin lives, as an URL
// path. Has to be a pure function of the URL: the scrape stage saves the file
// there, and a later stage finds it again without any network access.
exports.externalUrlPath = (externalUrl) => {
  const hash = crypto.createHash('sha256').update(externalUrl).digest('hex');
  const basename = new URL(externalUrl).pathname.split('/').pop() || 'file';
  return `/uploads/external/${hash.slice(0, 8)}/${basename}`;
};

exports.writeFile = async (filepath, data) => {
  await fs.promises.mkdir(path.dirname(filepath), {recursive: true});
  await fs.promises.writeFile(filepath, data);
};

exports.readJson = (filepath) => {
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
};

// All files under a directory, recursively.
exports.listFiles = (dir) => {
  const result = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const entrypath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...exports.listFiles(entrypath));
    } else {
      result.push(entrypath);
    }
  }
  return result.sort();
};

// Calls visit(value, key) on every string in a JSON value. If visit returns a
// string the value is replaced by it.
exports.walkStrings = (node, visit) => {
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      const replacement = visit(value, key);
      if (typeof replacement === 'string') {
        node[key] = replacement;
      }
    } else if (value && typeof value === 'object') {
      exports.walkStrings(value, visit);
    }
  }
};

// Keys whose value is the URL of a file, in rCTF API responses.
exports.isUrlKey = (key) => {
  return /url$/i.test(key) || key === 'iconLight' || key === 'iconDark';
};
