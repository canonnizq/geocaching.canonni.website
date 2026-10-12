/**
 * Rasterises a card to PNG.
 *
 * @resvg/resvg-js is CommonJS, so the namespace comes off the default export;
 * that form also works when this module is loaded by plain Node (the tests and
 * the dev server import it directly).
 */
import resvgPkg from '@resvg/resvg-js';
import { CARD_WIDTH } from './seriesCard.ts';

const { Resvg } = resvgPkg;

/** Latin sample with enough shape to tell "rendered" from "blank". */
const FONT_PROBE = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="#FFFFFF"/><text x="4" y="24" font-size="22" font-family="DejaVu Sans,Helvetica,Arial,sans-serif">Ag</text></svg>';

let fontsAvailable: boolean | undefined;

function hasInk(pixels: Uint8Array | Buffer): boolean {
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] < 225 || pixels[index + 1] < 225 || pixels[index + 2] < 225) return true;
  }

  return false;
}

/**
 * Whether the runtime can draw text at all.
 *
 * A serverless image may ship without fonts, in which case a rasterised card
 * would be a convincing-looking panel with no words on it. Callers use this to
 * serve the vector card instead, which the viewing browser renders with its own
 * fonts. Probed once per instance and then remembered.
 */
export function canRenderText(): boolean {
  if (fontsAvailable !== undefined) return fontsAvailable;

  try {
    const { pixels } = new Resvg(FONT_PROBE, { font: { loadSystemFonts: true } }).render();
    fontsAvailable = hasInk(pixels);
  } catch {
    fontsAvailable = false;
  }

  if (!fontsAvailable) {
    console.warn('No usable font found; serving SVG cards so text still renders in the browser.');
  }

  return fontsAvailable;
}

/** Renders the card at its natural size. */
export function renderCardPng(svg: string): Uint8Array<ArrayBuffer> {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: CARD_WIDTH },
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng();

  // Copied out of resvg's buffer so the bytes are owned by a plain ArrayBuffer,
  // which is what Response accepts as a body.
  return new Uint8Array(png);
}
