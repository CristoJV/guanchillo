# RFC 001 · Generate a pattern from an image

**Status** · Pending review.

## Proposed workflow

Open a local PNG, JPEG or WebP. Choose the dimensions and maximum number of colors, then preview the result before creating an editable pattern. Offer crop and aspect ratio controls. Allow transparent areas to become unassigned stitches or use a selected color. Image processing takes place in the browser.

## Options

- Downsample with Canvas 2D and apply median-cut quantization. The result is deterministic and can lose details smaller than a stitch.
- Apply k-means to the reduced image for more control over color error, at the cost of more computation and an initialization choice.
- Map the image to the colors of an existing palette so the crocheter can use yarn they already have.

The proposal is to prototype median cut without automatic dithering. Dithering can turn smooth colors into frequent one-stitch yarn changes. Swatch measurements may justify a manual aspect ratio adjustment.

## Open questions

- Should the first version prioritize photographs or simple motifs?
- Should it offer both automatic and fixed palettes?
- What level of simplification produces a workable number of yarn changes?

Validate with a transparent image, a two-color motif and a photograph. Check that preview dimensions and color limits match the resulting editable pattern.
