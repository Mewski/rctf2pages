const fs = require('node:fs');

const util = require('../util.js');

const {PAGES_REPO} = process.env;

const main = async function() {
  const config = util.readJson(
      `${PAGES_REPO}/api-data/v2/integrations/client/config.json`);
  const {origin} = new URL(config.data.origin);

  // Where the scrape saved the file an absolute URL points to, if it did.
  const localize = (fileUrl) => {
    let local;
    try {
      const url = new URL(fileUrl);
      if (url.origin === origin) {
        local = url.pathname;
      } else if (url.protocol === 'http:' || url.protocol === 'https:') {
        local = util.externalUrlPath(fileUrl);
      } else {
        return undefined;
      }

      if (!fs.existsSync(util.urlPathToFile(PAGES_REPO, local))) {
        return undefined;
      }
    } catch {
      // Not an absolute URL, nothing to do
      return undefined;
    }

    console.log(`${fileUrl} -> ${local}`);
    return local;
  };

  for (const file of util.listFiles(`${PAGES_REPO}/api-data`)) {
    const json = util.readJson(file);

    let changed = false;
    util.walkStrings(json, (value, key) => {
      const local = util.isUrlKey(key) ? localize(value) : undefined;
      changed ||= local !== undefined;
      return local;
    });

    if (changed) {
      fs.writeFileSync(file, JSON.stringify(json));
    }
  }

  return 0;
};

if (require.main === module) {
  main().then(process.exit);
}
