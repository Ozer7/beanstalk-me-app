// ---------------------------------------------------------------------------
// Prompt builders. Each image call gets one of these. The STYLE line, Jack's
// outfit and the cast descriptions come from storyboard.js and are pasted in
// word-for-word every time, so nothing about the look drifts between calls.
// ---------------------------------------------------------------------------
import { JACK_OUTFIT, CAST, EXPRESSION_RULE, getPage, styleText } from "./storyboard.js";

// The book's style (storyboard STYLES), the same line in every call for a book.
const styleLine = (style) => `STYLE: ${styleText(style)}`;

const NO_TEXT =
  "No text anywhere — no letters, numbers, signs, labels, captions or speech bubbles. " +
  "One full-bleed picture, no border or frame.";

const SAME_JACK =
  "same face shape, eyes, eyebrows, nose, mouth, ears, skin tone, hair colour, hairstyle and " +
  "hair length, same glasses and facial hair if he has them, same age and body proportions, " +
  "same outfit";

// How the reference images are described. `first` is the image number of the
// Jack reference; with `hasSheet`, the character sheet is the next image.
function referenceLines(first, hasSheet) {
  const n = (k) => `IMAGE ${first + k}`;
  const lines = [
    `${n(0)} is the character reference for Jack. Jack in this picture is exactly that person: ${SAME_JACK}.`,
  ];
  if (hasSheet) {
    lines.push(
      `${n(1)} is Jack's character sheet: the same Jack from the front, at three-quarter angles ` +
        "and in profile, and with several expressions. When Jack turns his head or shows a " +
        `feeling on this page, copy how his face looks from that angle and with that feeling in ${n(1)}.`
    );
  }
  lines.push(
    "Use the reference images for Jack only — not their plain backgrounds, layouts or standing poses."
  );
  return lines;
}

function zoneName(zone) {
  const part = { 2: "half", 3: "third", 4: "quarter" }[Math.round(1 / zone.fraction)] || "part";
  return `${zone.edge} ${part}`;
}

function header(page) {
  return `Picture-book illustration: Jack and the Beanstalk, page ${page.id} of 20 — "${page.title}".`;
}

function castBlock(page) {
  if (!page.cast?.length) return [];
  return [
    "ALSO IN THIS PICTURE (each looks the same on every page it appears on):",
    ...page.cast.map((key) => `- ${CAST[key]}`),
    "",
  ];
}

function wordsBlock(page) {
  return (
    `SPACE FOR THE WORDS: keep the ${zoneName(page.textZone)} of the picture quiet and simple — ` +
    `${page.textSpace}. No people, faces, hands, important objects or busy detail there. ` +
    "The words of the page are printed over that area later."
  );
}

// 1) Photo -> Jack. Made once per book; the result is the reference for every page.
export function referencePrompt({ style } = {}) {
  return [
    "Character reference portrait for a picture book: Jack and the Beanstalk.",
    "",
    "IMAGE 1 is a photo of a real child. That child plays Jack on every page of the book. " +
      "Turn the child into an animated character.",
    "",
    "LIKENESS — the most important rule: anyone who knows this child must recognize them instantly. " +
      "Keep their face shape, eye shape and eye colour, eyebrows, nose, mouth, ears, skin tone, " +
      "freckles or other marks, hair colour, hair texture, hairstyle and hair length, and glasses " +
      "if they wear them. Keep their apparent age, and body proportions right for that age. " +
      "Stylize the child's real features — do not replace them with a generic cartoon face.",
    "",
    styleLine(style),
    "",
    `OUTFIT: Jack wears ${JACK_OUTFIT}. This replaces whatever the child wears in the photo.`,
    "",
    "POSE AND FRAMING: full body, standing straight and facing the viewer, arms relaxed at the " +
      "sides, a calm, friendly expression with the mouth closed. The face is evenly lit from the " +
      "front. The figure fills most of the picture's height, with a little space above the head " +
      "and below the boots.",
    "",
    "BACKGROUND: a plain, softly lit warm-cream backdrop with nothing else in it.",
    "",
    "RULES: exactly one person. No text, letters, numbers, logos or watermarks.",
  ].join("\n");
}

// 1b) Jack's character sheet: the same Jack turned to several angles and with
//     several expressions, so pages where he turns or emotes still look like him.
//     Image 1 = the Jack reference, image 2 = the photo (for likeness).
export function sheetPrompt({ style } = {}) {
  return [
    "Character sheet for a picture book: Jack and the Beanstalk.",
    "",
    "IMAGE 1 is Jack, already designed. IMAGE 2 is the photo of the real person he is based on, " +
      "for likeness only. Draw the SAME Jack as IMAGE 1 several times on one wide sheet: same " +
      `face, glasses and facial hair if any, same hair, same body, same outfit (${JACK_OUTFIT}).`,
    "",
    styleLine(style),
    "",
    "LAYOUT, on a plain, softly lit warm-cream background:",
    "- TOP ROW: four full-body views of Jack standing, side by side, the same size and evenly " +
      "spaced: facing the viewer; three-quarter view turned to his left; side profile; " +
      "three-quarter view turned to his right.",
    "- BOTTOM ROW: four large head-and-shoulders close-ups of Jack facing the viewer, with these " +
      "expressions: a warm smile; worried (eyebrows raised and drawn together); amazed and " +
      "delighted (eyebrows up, eyes wide, big open smile); shocked (eyebrows high, mouth open in " +
      'a round "oh!").',
    "- Leave a clear empty band of backdrop between the two rows (the boots must not touch the " +
      "close-ups) and clear space between the views in each row.",
    "",
    EXPRESSION_RULE,
    "",
    "RULES: every figure is the same person as IMAGE 1. No text, labels, numbers, arrows or " +
      "lines between the views.",
  ].join("\n");
}

// 2) Fix one thing on the reference. Image 1 = current reference, image 2 = the photo.
export function referenceEditPrompt(instruction, { style } = {}) {
  return [
    "Edit IMAGE 1, the character reference portrait of Jack for a picture book. " +
      "IMAGE 2 is the original photo of the child, for likeness only.",
    "",
    `CHANGE ONLY THIS: ${instruction}`,
    "",
    "Keep everything else exactly as it is: the same child, face, hair, outfit, pose, framing, " +
      "lighting and plain background.",
    "",
    styleLine(style),
    "",
    "RULES: exactly one person. No text, letters, numbers, logos or watermarks.",
  ].join("\n");
}

// 3) Make a page. Image 1 = the Jack reference, image 2 = Jack's character
//    sheet (when there is one). A page with `editOf` is made from an earlier
//    page instead: image 1 = that page, then the reference(s).
export function pagePrompt(pageOrId, { sheet = true, style } = {}) {
  const page = typeof pageOrId === "object" ? pageOrId : getPage(pageOrId);
  const fromPage = page.editOf ? getPage(page.editOf) : null;

  const images = fromPage
    ? [
        `IMAGE 1 is page ${fromPage.id} of this book ("${fromPage.title}"). Make this page by editing it: ` +
          "keep the same camera position, the same cottage, garden and surroundings. " +
          `What changes: ${page.scene}`,
        "",
        ...referenceLines(2, sheet),
      ]
    : referenceLines(1, sheet);

  return [
    header(page),
    "",
    ...images,
    "",
    styleLine(style),
    "",
    `JACK'S OUTFIT, the same on every page: ${JACK_OUTFIT}.`,
    "",
    ...castBlock(page),
    ...(fromPage ? [] : [`SCENE: ${page.scene}`]),
    `JACK: ${page.jack}`,
    `JACK'S EXPRESSION: ${page.expression}. ${EXPRESSION_RULE}`,
    ...(page.others ? [`OTHER CHARACTERS: ${page.others}`] : []),
    `LIGHT AND COLOUR: ${page.light}`,
    wordsBlock(page),
    "",
    `RULES: Jack appears exactly once. ${NO_TEXT}`,
  ].join("\n");
}

// 4) Fix one thing on a finished page. Image 1 = the page, image 2 = the Jack
//    reference, image 3 = Jack's character sheet (when there is one).
export function pageEditPrompt(pageOrId, instruction, { sheet = true, style } = {}) {
  const page = typeof pageOrId === "object" ? pageOrId : getPage(pageOrId);
  const refs = sheet ? "IMAGE 2 (Jack's reference) and IMAGE 3 (his character sheet)" : "IMAGE 2, the character reference";
  return [
    `Edit IMAGE 1. It is page ${page.id} of a picture book: Jack and the Beanstalk — "${page.title}".`,
    "",
    `CHANGE ONLY THIS: ${instruction}`,
    "",
    "Keep everything else in image 1 exactly as it is: the composition, camera angle, characters, " +
      `poses, setting, lighting and colours. If the change touches Jack, Jack must still match ${refs}: ${SAME_JACK}.`,
    "",
    styleLine(style),
    "",
    `SPACE FOR THE WORDS: the ${zoneName(page.textZone)} of the picture must stay quiet and simple — ` +
      `${page.textSpace}.`,
    "",
    `RULES: Jack appears exactly once. ${NO_TEXT}`,
  ].join("\n");
}

// Free-text instructions from the UI: one line, bounded length.
export function cleanInstruction(raw) {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
