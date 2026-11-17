const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const util = require('./util.js');

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const isFile = (filepath) => {
  return fs.existsSync(filepath) && fs.statSync(filepath).isFile();
};

// What GitHub Pages would answer with: there are no queries, /page is
// page.html, and 404.html stands in for everything that does not exist.
const resolve = (root, urlPath) => {
  let filepath;
  try {
    filepath = util.urlPathToFile(root, urlPath);
  } catch {
    return {status: 404};
  }

  if (isFile(filepath)) {
    return {status: 200, filepath};
  } else if (isFile(`${filepath}.html`)) {
    return {status: 200, filepath: `${filepath}.html`};
  } else if (fs.existsSync(filepath) && !urlPath.endsWith('/')) {
    return {status: 301, location: `${urlPath}/`};
  } else {
    return {status: 404};
  }
};

const main = async function() {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.length > 2) {
    console.error(
        `Usage: ${process.argv[0]} ${process.argv[1]} [path] [port]`);
    return 1;
  }

  const root = path.resolve(args[0]);
  const port = Number(args[1] || 8000);

  const server = http.createServer((request, response) => {
    const {pathname} = new URL(request.url, 'http://localhost');
    let {status, filepath, location} = resolve(root, pathname);

    console.log(status, request.method, request.url);

    if (status === 301) {
      response.writeHead(301, {'Location': location});
      response.end();
      return;
    }

    if (status === 404) {
      filepath = path.join(root, '404.html');
      if (!isFile(filepath)) {
        response.writeHead(404, {'Content-Type': 'text/plain'});
        response.end('404 Not Found\n');
        return;
      }
    }

    response.writeHead(status, {
      'Content-Type': CONTENT_TYPES[path.extname(filepath).toLowerCase()] ||
          'application/octet-stream',
    });
    if (request.method === 'HEAD') {
      response.end();
    } else {
      fs.createReadStream(filepath).pipe(response);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Serving ${root} on http://127.0.0.1:${port}/`);
  });

  // Serve until interrupted
  return new Promise(() => {});
};

if (require.main === module) {
  main().then(process.exit);
}
