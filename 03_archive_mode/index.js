const assert = require('node:assert');
const fs = require('node:fs');

const util = require('../util.js');

const {PAGES_REPO} = process.env;

const main = async function() {
  const file = `${PAGES_REPO}/api-data/v2/integrations/client/config.json`;
  const config = util.readJson(file);

  // The frontend takes care of the rest: it stops offering to login,
  // register, submit flags and start instances.
  assert(config.data.isArchived === false,
      'This version of rCTF does not know about archives');
  config.data.isArchived = true;

  fs.writeFileSync(file, JSON.stringify(config));

  return 0;
};

if (require.main === module) {
  main().then(process.exit);
}
