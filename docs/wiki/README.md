# Guanchillo user guide

## Design a pattern

1. Select **New pattern**, give it a name and set the dimensions. You can also try the **Lava Diamond** example.
2. Choose a color and use the **Pencil** to click or drag on the grid. The **Eraser** leaves stitches unassigned.
3. Use **Undo** or **Redo** to revise your work. Each drag counts as one action.
4. Choose **Apply size** to resize. A flat grid grows with empty squares along the top and right edges. If you have started crocheting, Guanchillo asks before resetting your progress.
5. For a flat pattern, choose **Scale design** to multiply or divide the drawing and its grid by a whole-number factor. Use the chain to switch between one shared factor and separate horizontal and vertical factors. The size fields update when you apply the scale.
6. Use **Add color** to extend the palette, or use the pencil next to a color to edit or remove it. When removing a color in use, choose **Fill with closest color** or **Leave unassigned** for its stitches.
7. Use **Reduce colors** and choose the new count to preview the smaller palette. If the pattern has a matching color profile, Guanchillo uses that palette. Other counts merge similar yarn colors.

Zoom in to work on details. Select **Pan** and drag to move around. **Fit to view** restores the overview. On a phone, **Grid and reference** contains sizing and tracing controls. **Pattern details** contains the name, export and the 3D preview for spheres.

## Import a flat pattern from an image

1. Select **Import image** and choose a local PNG, JPEG or WebP file.
2. Set the number of **Columns** and **Rows** in stitches. The importer suggests a starting size based on the image's proportions.
3. Pick **Automatic colors** and set the maximum, or pick **My colors** to add and adjust the exact yarn colors you plan to use. Four is the default. New charts allow up to eight yarn colors.
4. Check the stitch preview, then select **Create pattern** to open it in **Design**. Transparent pixels become unassigned stitches.

## Trace a reference image

1. Open **Import image**, choose an image and select **Use as reference**. It appears beneath the squares of the current pattern. Painted squares remain translucent while the reference is visible.
2. For a flat pattern, enter the maximum **Rows** and **Columns** you want and choose **Fit grid to image**. This fits the image proportions within those dimensions and centers the reference. The usual resize rules apply to existing stitches and progress.
3. Select **Move image** and drag on the grid, or press the arrow keys to move the image one square at a time. **Center image** restores the starting position. Switch to **Pencil** or **Eraser** to edit squares.
4. Toggle **Show reference** to check the chart colors, or choose **Remove image** to clear the layer. Each reference stays with its pattern while the page is open.

## Browse the pattern catalog

Open **Catalog** and use **Tag** and **Type** together to find charts. You can also select a tag on a card to apply it. Pick **Recommended** for the suggested size or **High** for the master size when both are available. Use **Colors** to choose how many yarns to use, up to the number available in the master. The preview updates before you choose **Edit** or **Crochet**. Returning with the same settings reopens the local copy, including its progress.

Choose **Canarias** for the island outlines and other Canarian designs. Choose **Minecraft** for the seven 8 × 8 charts. Select **Source** on a card to see its attribution when available. On a phone, cards appear one per row.

To derive a smaller chart, choose a template in **New pattern**, then enter the stitch dimensions or number of rounds. Spheres top out at 63 rounds, the closest usable size to 64 under the multiple-of-three spiral rule. Changing the height of a flat template adjusts the width proportionally.

Use **Recommended** for the approximate Solar System scale when working with the same yarn and hook. The Moon uses 12 rounds, Earth uses 24, and Jupiter uses 42. [NASA's planetary fact sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/)

## Design a sphere

Choose **Sphere** under **New pattern**, then enter a multiple of three from 6 to 126 rounds. The 3D preview starts with the first round at the top of the finished sphere. Drag it or focus it and use the arrow keys to rotate.

Paint the squares in the six chart sections to update the globe. The spaces between the sections are gaps in the projection. The labels at the right show each round and its stitch count. In **Crochet**, **X** is a single crochet, **V** spans the two stitches of an increase, and **Λ** marks a decrease. Zoom in to see these marks on larger charts.

In **Design**, the chart matches the finished sphere, with the first round at the top. In **Crochet**, the chart turns 180° so you work from the first round at the bottom.

When following a sphere, crochet in a continuous spiral. The current stitch display tells you when to increase, decrease or work into the magic ring. Changing the number of rounds resamples your colors to fit the new chart. [Supergurumi's rounded sphere guide](https://www.supergurumi.com/es/tejer-esferas-y-bolas-de-cualquier-tamano)

## Save or transfer your work

Changes save in this browser as you work. **Save** confirms the current copy, and **My patterns** opens the library. **Export pattern** downloads a JSON file containing the design, palette and crochet progress. **Import** opens it as a new copy and restores the progress included in the file. On narrow screens, use **Import JSON** inside **My patterns**.

## Crochet

1. Open a pattern and select **Crochet**. In **Settings**, choose the starting row or round, column and direction. Row 1 is at the bottom and column 1 is on the left. Applying a starting point resets the stitch count.
2. Select **Start**. The instructions show how many full stitches to make in the current yarn and when to close a stitch with the next color. Same-color counts continue across rows and rounds.
3. After each stitch, tap the work area, choose **Next**, or press **Space**. **Back** or the Left arrow returns one stitch. Navigation, settings and other controls use their own actions.
4. On a phone, the strip shows up to eight stitches from the current row or round and moves with you. On desktop, you can click a stitch in the full chart to jump to it. The stitches before it along your path are marked complete. If you click before the configured starting point, the selected stitch becomes the new start.
5. Reopen the pattern in the same browser to resume. To move progress to another browser, export the pattern as JSON and import it there.

### Use a mouse or keyboard as a foot control

In **Crochet → Settings → Hands-free controls**, choose **Assign** for next stitch or previous stitch. Press the key or click the mouse button you want to use. You can configure either action on its own or assign one input to each. Choose **Reset** to remove a custom assignment. Assignments are saved in the browser and apply across patterns. An assigned input takes priority over its default action.

Click or tap a free part of the crochet screen to work without aiming for a button. The full desktop chart uses its own click-to-jump action. A held key counts as one press. Touch and the on-screen stitch buttons are also available.

## Keyboard shortcuts

| Where | Keys |
| --- | --- |
| Pattern grid in Design | Arrow keys to move, Space or Enter to apply the active tool |
| Grid or tool panel in Design | P for Pencil, E for Eraser, H for Pan, R for Move image when the reference is visible |
| Grid with Move image selected | Arrow keys to nudge the reference by one square |
| Undo or redo | Ctrl or Cmd + Z to undo, Ctrl or Cmd + Shift + Z to redo. Ctrl or Cmd + Y also redoes |
| Crochet mode | Space, Enter or Right arrow to start or advance, Left arrow to go back. Focused controls use their normal keyboard input |
