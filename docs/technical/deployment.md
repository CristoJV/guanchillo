# Static deployment

Run `npm ci` and `npm run build`. Publish the contents of `dist/` to a static host with `index.html` as the entry point. Preserve the relative paths and serve `.js` files as JavaScript. Only the build needs Node.js and npm.

For a local smoke test, run `python3 -m http.server 8000 --directory dist`. Open a pattern, make a change, export and reimport it, then confirm the crochet progress resumes after a page reload.

The browser stores data separately for each origin, including the port. Export a pattern before switching origin if you want to transfer its design and progress.
