# Ganchillo

Design tapestry crochet patterns and follow them stitch by stitch. Ganchillo runs in the browser and supports versioned JSON files for sharing patterns and crochet progress.

## Run locally

With Node.js 22 or later, npm and Python 3 installed, run the following from the repository root.

```sh
npm ci
npm run build
python3 -m http.server 8000 --directory dist
```

Open [Ganchillo at localhost:8000](http://localhost:8000). Run `npm run check` for type checking and rebuild after editing the source.

## What is an `.mjs` file?

An `.mjs` file is a JavaScript ES module. It uses standard `import` and `export` statements, and the extension tells Node.js to load it as a module. Ganchillo now has `.ts` source files that compile to `.js` ES modules. [Node.js documentation](https://nodejs.org/api/esm.html#enabling)

## Documentation

| Topic | Reference |
| --- | --- |
| Design a pattern or resume a project | [User guide](docs/wiki/README.md) |
| Code structure and versioned JSON format | [Architecture](docs/technical/architecture.md) |
| Static hosting | [Deployment](docs/technical/deployment.md) |
| MVP scope | [Delivery plan](docs/plans/001-mvp.md) |
| Implemented architecture decisions | [ADR 001](docs/adrs/001-static-architecture.md) |
| Proposed image import | [RFC 001](docs/rfcs/001-import-image.md) |
