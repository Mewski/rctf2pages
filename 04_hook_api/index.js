const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {PAGES_REPO} = process.env;

const INJECTED_JS_PATH = '/rctf2pages/hooks.js';

const main = async function() {
  const indexHtml = `${PAGES_REPO}/index.html`;
  const hooksJs = PAGES_REPO + INJECTED_JS_PATH;

  await fs.promises.mkdir(path.dirname(hooksJs), {recursive: true});
  await fs.promises.copyFile(path.join(__dirname, 'hooks.js'), hooksJs);

  // The hooks have to be in place before the app makes its first request, so
  // load them ahead of every other script. The content security policy of
  // rCTF allows scripts of the site itself.
  const inputhtml = fs.readFileSync(indexHtml, 'utf8');
  assert(!inputhtml.includes(INJECTED_JS_PATH));

  const outputhtml = inputhtml.replace(/([ \t]*)<script/,
      `$1<script src="${INJECTED_JS_PATH}"></script>\n$1<script`);
  assert(outputhtml !== inputhtml);

  fs.writeFileSync(indexHtml, outputhtml);

  return 0;
};

if (require.main === module) {
  main().then(process.exit);
}
