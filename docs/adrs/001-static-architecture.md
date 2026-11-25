# ADR 001 · Static browser architecture

**Status** · Implemented.

- Use TypeScript with native HTML, CSS and ES modules. The interface fits on one page, and the compiler provides type checking while keeping the deployment a directory of static files.
- Render the grid with Canvas 2D to avoid allocating a DOM node for each stitch. Keep keyboard controls and textual feedback in HTML so they remain available to assistive technology.
- Store data in `localStorage` and exchange designs and progress as versioned JSON. The records are small, and each crochet step writes only the session record.

See [architecture](../technical/architecture.md) for module ownership and the JSON contract.
