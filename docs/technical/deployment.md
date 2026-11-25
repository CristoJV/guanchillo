# Static deployment

## GitHub Pages

Select **GitHub Actions** under **Settings → Pages → Build and deployment → Source**. A push to `main` runs the [Pages workflow](../../.github/workflows/pages.yml), which builds and tests the app and uploads only `dist/`. GitHub issues the deployment credentials for the job. [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Treat committed files and the static build as material that can be published. Keep credentials in ignored local files. GitHub's [push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection) can block recognized secrets before a push reaches the repository.

## Other static hosts

Run `npm ci` and `npm run build`. Publish `dist/` as the site root, preserve its relative paths and serve `.js` files as JavaScript.

For a local smoke test, run `python3 -m http.server 8000 --directory dist`. Open a pattern, make a change, export and reimport it, then confirm the crochet progress resumes after a page reload.

The browser stores data separately for each origin, including the port. Export a pattern before switching origin if you want to transfer its design and progress.
