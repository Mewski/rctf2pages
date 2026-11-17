// An archived rCTF does not take flags anymore, it only says "The CTF is
// archived." where the flag would go. Put a box there that checks the flag
// against the hashes of the right ones, here in the browser.

(() => {
  // Challenge ID => SHA-256 of each of its flags
  const FLAGS = {/* FLAGS */};

  const FORM_HTML = `
    <submit-row>
      <input data-flag-input type="text" aria-label="Flag"
          autocomplete="off" autocorrect="off" spellcheck="false"
          style="padding-inline: 0.75rem; color: var(--foreground-l0);
              background: var(--background-l4); border: 2px solid transparent">
      <submit-notice data-tone="success" style="display: none">
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em"
            viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" stroke-linecap="round"
              stroke-linejoin="round" stroke-width="2" d="m5 12l5 5L20 7" />
        </svg>
        <span>Flag correct!</span>
      </submit-notice>
      <span role="status" style="display: none; align-self: center;
          color: var(--foreground-destructive)">Flag incorrect</span>
      <button type="submit" aria-label="Check flag">
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em"
            viewBox="0 0 256 256" fill="currentColor">
          <path d="M231.4,44.34s0,.1,0,.15l-58.2,191.94
              a15.88,15.88,0,0,1-14,11.51q-.69.06-1.38.06
              a15.86,15.86,0,0,1-14.42-9.15L107,164.15
              a4,4,0,0,1,.77-4.58l57.92-57.92a8,8,0,0,0-11.31-11.31
              L96.43,148.26a4,4,0,0,1-4.58.77L17.08,112.64
              a16,16,0,0,1,2.49-29.8l191.94-58.2.15,0
              A16,16,0,0,1,231.4,44.34Z" />
        </svg>
      </button>
    </submit-row>`;

  const sha256sum = async (string) => {
    const utf8 = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
    return Array.from(new Uint8Array(hashBuffer))
        .map((bytes) => bytes.toString(16).padStart(2, '0'))
        .join('');
  };

  const placeholder = fetch('/api/v2/integrations/client/config')
      .then((response) => response.json())
      .then((config) => config.data.flagFormatPlaceholder || 'flag{...}');

  const makeForm = (submit, chalId) => {
    const form = document.createElement('form');
    form.dataset.rctf2pages = chalId;
    form.innerHTML = FORM_HTML;

    // The style of the real form is still around, and scoped to this class
    for (const node of [form, ...form.querySelectorAll('*')]) {
      node.setAttribute('class', submit.className);
    }

    const input = form.querySelector('input');
    const correct = form.querySelector('submit-notice');
    const incorrect = form.querySelector('[role="status"]');

    placeholder.then((text) => {
      input.placeholder = text;
    });

    const setIncorrect = (isIncorrect) => {
      incorrect.style.display = isIncorrect ? '' : 'none';
      input.style.borderColor =
          isIncorrect ? 'var(--foreground-destructive)' : 'transparent';
    };
    input.addEventListener('input', () => setIncorrect(false));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const flag = input.value.trim();
      if (!flag) {
        return;
      }

      if (FLAGS[chalId].includes(await sha256sum(flag))) {
        input.style.display = 'none';
        correct.style.display = '';
        form.querySelector('button').disabled = true;
      } else {
        setIncorrect(true);
      }
    });

    return form;
  };

  const update = () => {
    const chalId = new URLSearchParams(location.search).get('challenge');

    for (const submit of document.querySelectorAll('challenge-submit')) {
      let form = submit.querySelector('form[data-rctf2pages]');
      if (form && form.dataset.rctf2pages !== chalId) {
        // Another challenge got opened in the same place
        form.remove();
        form = null;
      }

      const hasFlags = FLAGS[chalId]?.length > 0;
      for (const notice of submit.querySelectorAll(':scope > submit-notice')) {
        notice.style.display = hasFlags ? 'none' : '';
      }
      if (hasFlags && !form) {
        submit.append(makeForm(submit, chalId));
      }
    }
  };

  // The app renders the challenge whenever it sees fit, keep up with it.
  let pending = false;
  new MutationObserver(() => {
    if (!pending) {
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        update();
      });
    }
  }).observe(document.documentElement, {childList: true, subtree: true});
})();
