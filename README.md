# Guanchillo

Design flat or spherical tapestry crochet patterns and follow them stitch by stitch. Import a local image into a flat chart or start from a template in the catalog. Guanchillo runs in the browser and supports versioned JSON files for sharing patterns and crochet progress.

## Run locally

With Node.js 22 or later, npm and Python 3 installed, run the following from the repository root.

```sh
npm ci
npm run build
python3 -m http.server 8000 --directory dist
```

Open [Guanchillo at localhost:8000](http://localhost:8000). Run `npm run check` for type checking and `npm test` for unit tests. Rebuild after editing the source.

For the mobile and desktop browser tests, run `npx playwright install chromium --only-shell` once, then `npm run test:browser`. The suite serves `dist/` on a local HTTP port.

## What is an `.mjs` file?

An `.mjs` file is a JavaScript ES module. It uses standard `import` and `export` statements, and the extension tells Node.js to load it as a module. Guanchillo now has `.ts` source files that compile to `.js` ES modules. [Node.js documentation](https://nodejs.org/api/esm.html#enabling)

## Documentation

| Topic | Reference |
| --- | --- |
| Design a pattern or resume a project | [User guide](docs/wiki/README.md) |
| Code structure and versioned JSON format | [Architecture](docs/technical/architecture.md) |
| Static hosting | [Deployment](docs/technical/deployment.md) |
| MVP scope | [Plan 001](docs/plans/001-mvp.md) |
| Portrait mobile layout and hands-free controls | [Plan 002](docs/plans/002-mobile-portrait.md) |
| Project continuity, search and catalog previews | [Plan 003](docs/plans/003-continuity-and-discovery.md) |
| Implemented architecture decisions | [ADR 001](docs/adrs/001-static-architecture.md) |
| Image import decisions and proposals | [RFC 001](docs/rfcs/001-import-image.md) |
