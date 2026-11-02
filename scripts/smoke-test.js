// End-to-end check with placeholder pictures (no API calls, no cost):
// prompts -> Jack -> pages 1-3 -> PDF. Run with `npm test`.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.MOCK_IMAGES = "1";
const { STYLE, JACK_OUTFIT, PAGES, enabledPages } = await import("../lib/storyboard.js");
const { referencePrompt, referenceEditPrompt, pagePrompt, pageEditPrompt } = await import("../lib/prompts.js");
const { editImage } = await import("../lib/images.js");
const { buildBookPdf, unsupportedChars } = await import("../lib/pdf.js");
const { measureTextZone } = await import("../lib/look.js");

const count = (hay, needle) => hay.split(needle).length - 1;

// 1. The style is worded the same way, exactly once, in every call.
const prompts = [
  referencePrompt(),
  referenceEditPrompt("Make the hair curlier."),
  ...PAGES.map((p) => pagePrompt(p)),
  ...enabledPages().map((p) => pageEditPrompt(p, "Make the beans brighter.")),
];
for (const p of prompts) assert.equal(count(p, STYLE), 1, "style line must appear exactly once");
for (const p of PAGES) assert.equal(count(pagePrompt(p), JACK_OUTFIT), 1, `page ${p.id}: outfit must appear once`);
for (const p of PAGES) assert.match(pagePrompt(p), /No text anywhere/, `page ${p.id}: must forbid drawn text`);
assert.match(pagePrompt(4), /IMAGE 1 is page 3/, "page 4 is made by editing page 3");
console.log(`✓ ${prompts.length} prompts: same style line, same outfit, no drawn text`);

// 2. One reference, reused for every page.
const reference = await editImage({ images: [], prompt: referencePrompt(), mock: "reference" });
const pages = [];
for (const spec of enabledPages()) {
  const image = await editImage({ images: [reference], prompt: pagePrompt(spec), mock: spec.id });
  const look = await measureTextZone(image, spec);
  pages.push({ spec, image });
  console.log(`✓ page ${spec.id}: words in the ${spec.textZone.edge} zone, ${look.ink} ink`);
}
assert.equal((await measureTextZone(pages[1].image, pages[1].spec)).ink, "dark", "page 2 sky -> dark words");
assert.equal((await measureTextZone(pages[2].image, pages[2].spec)).ink, "light", "page 3 grass -> light words");

// 3. The PDF: pages in order, then About Me.
const child = { name: "Test Child", age: "6", likes: "drawing", food: "", growUp: "a vet", more: "Likes cows." };
const pdf = await buildBookPdf({ pages, reference, child });
const { PDFDocument } = await import("pdf-lib");
const pageCount = (await PDFDocument.load(pdf)).getPageCount();
assert.equal(pageCount, enabledPages().length + 1, "story pages + About Me");
const out = path.join(os.tmpdir(), "beanstalk-smoke-test.pdf");
fs.writeFileSync(out, pdf);
console.log(`✓ PDF: ${pageCount} pages, ${(pdf.length / 1024).toFixed(0)} KB → ${out}`);

// 4. About Me refuses characters the font can't print (instead of printing boxes).
assert.deepEqual(unsupportedChars("Zoë O’Brien-Núñez"), []);
assert.ok(unsupportedChars("שלום").length > 0);
console.log("✓ About Me font check");
console.log("All good.");

// 5. The painted style replaces the 3D one everywhere, still exactly once.
const { STYLES } = await import("../lib/storyboard.js");
for (const p of [referencePrompt({ style: "painted" }), pagePrompt(1, { style: "painted" })]) {
  assert.equal(count(p, STYLES.painted.text), 1, "painted style line once");
  assert.equal(count(p, STYLE), 0, "no 3D style line in a painted book");
}
console.log("✓ Painted style");
