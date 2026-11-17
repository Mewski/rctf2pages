const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const util = require('../util.js');

const {PAGES_REPO, ADMIN_CHALLS} = process.env;

const INJECTED_JS_PATH = '/rctf2pages/hooks.js';
const FLAGS_PLACEHOLDER = '{/* FLAGS */}';

const makeFlagsJson = () => {
  const archived = util.readJson(`${PAGES_REPO}/api-data/v2/challs.json`);
  const chalid2name = new Map(
      archived.data.map((chal) => [chal.id, chal.name]));

  // Either the whole response of the admin API or only the data in it
  const admin = util.readJson(ADMIN_CHALLS);
  const adminChals = admin.data || admin;
  assert(Array.isArray(adminChals), `${ADMIN_CHALLS} has no challenges`);

  const flags = {};
  for (const chal of adminChals) {
    if (!chalid2name.has(chal.id)) {
      console.log(`Unknown challenge "${chal.name}"`);
      continue;
    }

    for (const entry of chal.flags || []) {
      // The other kinds of flags are not a single string to compare against
      if (entry.provider !== 'flags/static') {
        continue;
      }

      const hash = crypto.createHash('sha256')
          .update(entry.config.flag).digest('hex');

      if (flags[chal.id] === undefined) {
        flags[chal.id] = [];
      }
      flags[chal.id].push(hash);
    }
  }

  for (const [id, name] of chalid2name) {
    if (flags[id] === undefined) {
      console.log(`No flag found for challenge ${name}`);
    }
  }

  return flags;
};

const main = async function() {
  const hooksJs = PAGES_REPO + INJECTED_JS_PATH;

  // The page already loads the hooks of the API, the ones of the flags join
  // them in the same file.
  const hooks = fs.readFileSync(hooksJs, 'utf8');
  const flagHooks = fs.readFileSync(path.join(__dirname, 'flags.js'), 'utf8');
  assert(!hooks.includes('const FLAGS = '));
  assert(flagHooks.split(FLAGS_PLACEHOLDER).length === 2);

  const flags = JSON.stringify(makeFlagsJson());
  fs.writeFileSync(hooksJs,
      `${hooks}\n${flagHooks.replace(FLAGS_PLACEHOLDER, () => flags)}`);

  return 0;
};

if (require.main === module) {
  main().then(process.exit);
}
