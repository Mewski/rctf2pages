# rctf2pages

Links rot, which would be especially sad when you have a beautifully themed
[rCTF](https://github.com/otter-sec/rctf) website :(.

rctf2pages turns a running rCTF into a static website, so that GitHub Pages
can host it long after the CTF event is over: the home page, the challenges
with their handouts and solves, the scoreboard with its graphs, and the
profile of every team. It can also keep the flag box working, checking flags
in the browser.

Challenges that need special hosting requirements, such as netcat-based
challenges and anything started by the instancer, are not in scope of this
project, unfortunately.

## How it works

The frontend of rCTF is a single page app that gets everything it shows from
the API. So there are no rendered pages to scrape:

- The app itself is downloaded as it is deployed, including a custom theme if
  the site has one, by following the references from one file to the next.
- Everything the API tells without logging in is dumped to JSON files.
- A small script loaded ahead of the app answers its API requests from those
  JSON files, in the browser. Pagination, filters and search included.
- rCTF has an archive mode, which is turned on. The app then stops offering to
  log in, register, and start instances.

## Usage

It's mostly just bash and JavaScript, without any dependencies to install.
You need git, and either Node.js 18+ or Bun.

This tool is separated into many stages, each does a different operation.
To see usage information:

```bash
$ ./stage
Usage: ./stage [stage number]
Stages:

  ./stage 00            init
  ./stage 01            scrape
  ./stage 02            localize_urls
[...]
```

For example, to archive `https://rctf.teamctf.com`:

```bash
$ export PAGES_REPO=~/rctf-pages
$ export RCTF_URL=https://rctf.teamctf.com
$ ./stage 00 && ./stage 01 && ./stage 02 && ./stage 03 && ./stage 04
$ ADMIN_CHALLS=~/admin-challs.json ./stage 05  # optional, see below
$ ./stage 06
$ ./preview
```

Each stage will operate on the git repository, but will not push unless
otherwise specified. To see what each stage does check `run.sh` for the
commit title, and `stage.sh` for the executed commands.

Only stage 01 talks to the rCTF website, which has to be up, and its CTF over
(or at least started, challenges are not public before that). The stages after
it work on what is in the repository.

`./preview [port]` serves the repository on `http://127.0.0.1:8000/` the way
GitHub Pages would, to have a look at the result before it goes anywhere.

### Flag verification

Stage 05 adds the SHA-256 hashes of the flags to the client side JS, and a
flag box to the challenges that checks against them. Without this stage the
challenges only say "The CTF is archived."

It needs the flags, which only admins get to see. Save the challenges as the
admin API lists them, and point `$ADMIN_CHALLS` to the file:

```bash
$ curl -H "Authorization: Bearer $TOKEN" \
    "$RCTF_URL"/api/v2/admin/challs > ~/admin-challs.json
```

`$TOKEN` is the token of an admin, `localStorage.token` in the browser console
of an admin that is logged in. Keep this file out of the pages repository, the
flags in it are not hashed.

Only static flags can be checked this way. Challenges with other kinds of
flags (regex, dynamic) keep saying "The CTF is archived."

### GitHub Pages Setup

Follow [GitHub documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
In particular, you need to setup a `CNAME` DNS record on your DNS provider to
`<user>.github.io` or `<organization>.github.io`. You also need to set the
"Custom domain" setting under GitHub Pages settings for the repository.

The custom domain is not optional: the app expects to be at the root of its
domain, it does not work under `<user>.github.io/<repository>/`.

Then, to push the repository:

```bash
$ GITHUB_REMOTE=git@github.com:teamctf/rctf.teamctf.com.git ./stage 99
```

## Compatibility

This is for the rCTF maintained by [OtterSec](https://github.com/otter-sec/rctf),
with the v2 API and the archive mode. The original
[redpwn/rctf](https://github.com/redpwn/rctf) is not supported.

rCTF itself can make a static export, with `rctf export`. That needs a
checkout and a build of the very rCTF that is deployed. rctf2pages only needs
the URL of the website, and the hooks answering the API requests follow the
idea of that export.

## License

Copyright 2026 the rctf2pages authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

&emsp; http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
