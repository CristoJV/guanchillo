# Static deployment

## GitHub Pages

Select **GitHub Actions** under **Settings → Pages → Build and deployment → Source**. This one-time step needs administrator or maintainer access. The [Pages workflow](../../.github/workflows/pages.yml) checks the site configuration first, then builds, tests and uploads only `dist/`. It runs on a push to `main`. To retry after enabling Pages, run **Publish GitHub Pages** manually from the **Actions** tab with `main` selected. [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

The default project URL is [cristojv.github.io/guanchillo](https://cristojv.github.io/guanchillo/). The deployment job reports the active URL when it succeeds. [GitHub Pages URL format](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#types-of-github-pages-sites)

Treat committed files and the static build as material that can be published. Keep credentials in ignored local files. GitHub's [push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection) can block recognized secrets before a push reaches the repository.

## Other static hosts

Run `npm ci` and `npm run build`. Publish `dist/` as the site root, preserve its relative paths and serve `.js` files as JavaScript.

For a local smoke test, run `python3 -m http.server 8000 --directory dist`. Open a pattern, make a change, export and reimport it, then confirm the crochet progress resumes after a page reload.

The browser stores data separately for each origin, including the port. Export a pattern before switching origin if you want to transfer its design and progress.
