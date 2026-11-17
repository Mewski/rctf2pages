const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {PAGES_REPO} = process.env;

// The routes of the app, from the table SvelteKit leaves in its entry point:
// {"/":[4],"/(auth)/login":[15,[3]],"/profile/[id]":[12],...}
const findRoutes = () => {
  const entryDir = `${PAGES_REPO}/_app/immutable/entry`;
  const entries = fs.readdirSync(entryDir)
      .filter((name) => /^app\..*\.js$/.test(name));
  assert(entries.length === 1);

  const source = fs.readFileSync(path.join(entryDir, entries[0]), 'utf8');
  const dictionaries = source
      .match(/\{(?:"\/[^"]*":\[[\d,[\]]*\],?)+\}/g)
      ?.filter((dictionary) => dictionary.includes('"/":'));
  assert(dictionaries?.length === 1, 'Cannot find the routes of the app');

  return Object.keys(JSON.parse(dictionaries[0]))
      // (groups) are not a part of the address
      .map((route) => route.replace(/\/\([^/]+\)/g, '') || '/');
};

const main = async function() {
  const userIds = fs.readdirSync(`${PAGES_REPO}/api-data/v2/users`)
      .map((name) => path.basename(name, '.json'));

  const pages = ['/404'];
  for (const route of findRoutes()) {
    if (route === '/' || /^\/admin(\/|$)/.test(route)) {
      continue;
    } else if (route === '/profile/[id]') {
      pages.push(...userIds.map((id) => `/profile/${id}`));
    } else if (!route.includes('[')) {
      pages.push(route);
    }
  }

  // Every page is the same app. GitHub Pages serves 404.html for the paths
  // it has nothing for, which is enough for the app to load and show the
  // right page, but then with a 404 status. Give each page a file as well.
  for (const page of pages) {
    const file = `${PAGES_REPO}${page}.html`;
    await fs.promises.mkdir(path.dirname(file), {recursive: true});
    await fs.promises.copyFile(`${PAGES_REPO}/index.html`, file);
    console.log(file);
  }

  // Without this GitHub Pages would not publish /_app
  fs.writeFileSync(`${PAGES_REPO}/.nojekyll`, '');

  return 0;
};

if (require.main === module) {
  main().then(process.exit);
}
