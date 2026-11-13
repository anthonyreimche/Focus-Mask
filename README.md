# Focus Mask

A Safelight extension that highlights what is in sharp focus on the Develop canvas, so you can judge focus and compare frames without zooming to 100 %.

## Using it

- Click **Focus** in the Develop status bar, or press **Shift+F**, to turn the mask on or off. It stays on as you move from photo to photo, so you can step through a burst and see which frame is sharp.
- The **▾** beside it opens the options. They are also in **Preferences ▸ Extensions ▸ Focus Mask**.
  - **Sensitivity**: how much softness still counts as in focus. Raise it to see the area that is nearly sharp, lower it to see only the crispest detail.
  - **Style**: **Tint** washes the in-focus areas with colour; **Edges** colours the sharp edges themselves, like focus peaking.
  - **Colour**: green, red, yellow, cyan or white.
- Change the shortcut in **Preferences ▸ Shortcuts**.

## What it measures

- The mask reads the photo as it was decoded, before your edits, so sharpening, clarity, texture and noise reduction don't change what reads as in focus.
- It compares how steep each edge is at two levels of blur. That tells a sharp edge from a soft one whatever its contrast, so a faint sharp edge counts and a bold blurry one doesn't.
- Fine noise is ignored, and the threshold for an edge rises with the photo's ISO, so high-ISO grain isn't marked as detail.
- It measures at a fixed share of the photo's size (1/3072 of its long edge) rather than at screen pixels, so the result is the same at fit view and at 100 %.
- Very small blur (well under a pixel on a high-resolution sensor) is finer than the mask can see. Zoom to 100 % to check the last bit of critical focus.

## A view aid only

The mask is drawn only on the Develop canvas. It never appears in exports, thumbnails, the stored preview, the histogram or colour pickers, and it isn't part of the edit: turning it on doesn't mark the photo as edited, and it isn't in the history, presets or copied settings.

While it is off it does no work on the photo. The first time you pause in Develop, Safelight quietly gets it ready in the background, so it appears as soon as you turn it on.

Needs Safelight 3.2.4 or later.

## Credits

The blur estimate from the ratio of gradients at two blur levels follows S. Zhuo and T. Sim, "Defocus map estimation from a single image" (Pattern Recognition, 2011).

## Licence

GPL-3.0-or-later. See `LICENSE`.
