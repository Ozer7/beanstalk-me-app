// ---------------------------------------------------------------------------
// The book bible. Everything that must stay the same across the whole book
// lives here, written once, and is pasted word-for-word into every prompt.
// ---------------------------------------------------------------------------

// The style for the whole book. Never edited per page, never changed mid-book.
export const STYLE =
  "Modern 3D animated feature — rounded forms, large expressive eyes, soft rim light.";

// Styles a book can be drawn in, chosen once per book before Jack is drawn.
// "painted" was added after the first round of feedback: 5 of 10 real
// respondents called the 3D look generic, glossy or "obviously AI", and two
// asked for something hand-drawn or painted. Each string is pasted word for
// word into every call for that book, like STYLE.
export const STYLES = {
  animated: { label: "3D animated", text: STYLE },
  painted: {
    label: "Painted storybook",
    text:
      "Hand-painted picture-book illustration in gouache and watercolour — visible brushstrokes " +
      "and paper texture, matte colours, soft natural light, gentle storybook proportions; not " +
      "3D, not glossy, not photographic.",
  },
};
export const DEFAULT_STYLE = "animated";
export function styleText(key) {
  return (STYLES[key] || STYLES[DEFAULT_STYLE]).text;
}

// Every picture (the Jack reference and every page) is the same tall 2:3 shape,
// which is also the shape of the PDF page (6 x 9 in). Tall leaves room for the
// beanstalk pages later in the book.
export const IMAGE_SIZE = "1024x1536";

// Jack's character sheet (second reference): wide, so it fits a row of turns
// and a row of expressions.
export const SHEET_SIZE = "1536x1024";

// How expressions are drawn on every page: big and readable, but they only move
// the eyebrows, eyes and mouth, so the face stays the child's face.
export const EXPRESSION_RULE =
  "Make Jack's expression big and easy to read, like a character in an animated feature, " +
  "but change only the eyebrows, eyes and mouth: face shape, nose, ears, hair, glasses and " +
  "facial hair (if any) stay exactly as in the references.";

// Jack's clothes, identical on every page.
export const JACK_OUTFIT =
  "a loose cream linen shirt with the sleeves rolled to the elbows, a moss-green wool vest, " +
  "a brown leather belt, patched tan knee-length trousers, and scuffed brown ankle boots";

// The rest of the cast and the recurring places. Only Jack has a reference
// image, so these fixed descriptions are what keep them consistent.
export const CAST = {
  mother:
    "Jack's mother — a slim woman in her thirties with a kind, tired face; her skin tone and hair " +
    "colour match Jack's; her hair is tucked under a faded blue headscarf; she wears a patched " +
    "grey-blue dress and a cream apron",
  cow:
    "Milky-White, the cow — a gentle, bony white cow with a pale pink nose, soft brown eyes, short " +
    "curved horns and a small brass bell on a rope collar",
  oldMan:
    "the old man — small, stooped and cheerful, with a long white beard, a battered pointed green " +
    "hat, a patched brown cloak and a crooked walking stick",
  cottage:
    "the cottage — a small, crooked stone cottage with a mossy thatched roof, a round blue wooden " +
    "front door and two small square windows",
};

// ---------------------------------------------------------------------------
// Pages. Add pages 4–20 by adding entries; nothing else has to change.
//
//   text       the words printed on the page (by the PDF layer, never the model)
//   textZone   where the words go: { edge: "top" | "bottom", fraction }
//   textSpace  what fills that zone in the picture, so it stays quiet
//   cast       keys of CAST that appear on the page
//   expression Jack's expression, spelled out as eyebrows / eyes / mouth
//   checks     what the automatic page check looks for after the picture is
//              made; each has the one-line fix it offers if it fails
//   editOf     optional: build this page by editing an earlier page's picture
//              instead of starting fresh from the reference (same place,
//              one thing changed — e.g. page 4 is page 3 the next morning)
// ---------------------------------------------------------------------------
export const PAGES = [
  {
    id: 1,
    title: "The empty cupboard",
    text: "Jack and his mother had nothing left to sell but Milky-White.",
    enabled: true,
    cast: ["mother", "cow", "cottage"],
    scene:
      "inside the cottage — a bare, poor kitchen. A wall cupboard stands wide open and is " +
      "completely empty. A cold fireplace, a bare wooden table, a single stool. Jack's mother " +
      "stands on the left beside the empty cupboard, worried. The round front door in the back " +
      "wall is open, and through it we see Milky-White standing in the sunny yard outside.",
    jack:
      "right of centre, facing the viewer — the full face is visible and lit from the front — " +
      "with the eyes turned toward the mother on the left.",
    expression:
      "worried but brave: eyebrows raised and drawn together a little, eyes soft, a small " +
      "brave closed-mouth smile",
    light:
      "soft morning light falls on Jack's face from the front. Warm, muted, earthy colours: " +
      "worn wood, grey stone, faded cloth.",
    textZone: { edge: "bottom", fraction: 1 / 3 },
    textSpace: "plain, empty floorboards",
    checks: [
      {
        label: "Empty cupboard",
        check: "Jack's mother is in the picture, next to an open, empty cupboard",
        fix: "Show the cupboard beside the mother wide open and completely empty.",
      },
      {
        label: "Cow through the door",
        check: "a white cow is visible through an open door",
        fix: "Show Milky-White, the white cow, clearly through the open door in the back wall.",
      },
    ],
  },
  {
    id: 2,
    title: "The trade",
    text: "“Five magic beans,” said the old man. “For one cow.”",
    enabled: true,
    cast: ["oldMan", "cow"],
    scene:
      "a dirt road through green fields on the way to market, with a small market town far " +
      "away on the horizon. The old man stands at the side of the road and holds his open palm " +
      "out toward Jack at Jack's chest height, near the middle of the picture. In the palm lie " +
      "exactly FIVE big, shiny beans, each about the size of a walnut, in one row with a gap " +
      "between each: one red, one gold, one green, one blue, one purple — five clearly different " +
      "colours, none touching, none hidden by fingers. There are no other beans anywhere in the " +
      "picture. Milky-White stands just behind Jack, on a rope that Jack holds.",
    jack:
      "in three-quarter view: Jack's body and head are turned about 45 degrees toward the old " +
      "man, with both eyes and most of the face still visible. Jack holds Milky-White's rope in " +
      "one hand and looks at the beans in the old man's palm. Same clothes as on page 1.",
    expression:
      "amazed and delighted: eyebrows up, eyes wide and shining, a big open-mouthed smile",
    light:
      "bright, clear late-morning daylight. Fresh greens, warm earth tones and a soft blue sky.",
    textZone: { edge: "top", fraction: 1 / 3 },
    textSpace:
      "open sky, calm and pale blue with only a few faint wisps of cloud. Nothing reaches up into " +
      "it: no birds, trees, rooftops, hills, heads, hats or horns. Frame the characters from a " +
      "little further back so the tops of all their heads sit well below the top third",
    checks: [
      {
        label: "Five beans in his palm",
        check:
          "the old man's open palm holds exactly five beans, coloured red, gold, green, blue and " +
          "purple (count them one by one and say how many you see)",
        fix:
          "Make it exactly five big beans in the old man's palm, in one row with gaps between " +
          "them: one red, one gold, one green, one blue, one purple.",
      },
      {
        label: "Jack holds the rope",
        check: "Jack holds a rope tied to the white cow",
        fix: "Put Milky-White's rope in Jack's hand.",
      },
    ],
  },
  {
    id: 3,
    title: "Out the window",
    text: "“Beans!” she cried. And out the window they went.",
    enabled: true,
    cast: ["mother", "cottage"],
    scene:
      "the front of the cottage at dusk, seen from the garden. Jack's mother leans out of an " +
      "open, lit window on the right and flings a handful of beans out over the garden. Exactly " +
      "five beans — one red, one gold, one green, one blue, one purple — fly out away from the " +
      "cottage in a wide, loose spray, each big enough to see clearly, heading down toward a bare " +
      "patch of garden soil in the middle of the picture, with open sky above that patch. They " +
      "do not run down the wall in a line.",
    jack:
      "standing in the open front doorway on the left, large in the frame: from head to boots he " +
      "fills about half of the picture's height, and his boots sit just above the bottom third. " +
      "He faces the viewer, with his face lit warmly and evenly from inside the cottage so every " +
      "feature is clear. Only his eyes look up toward the flying beans. One hand is raised to his " +
      "cheek.",
    expression:
      "shocked: eyebrows high, eyes wide, mouth open in a round \"oh no!\"",
    // A respondent noticed the mother looked "too joyous" here; she is angry.
    others:
      "Jack's mother is cross and fed up: brows pulled down and together, mouth a tight frown, " +
      "throwing the beans away hard — she is not smiling.",
    light:
      "dusk: a deep blue-violet evening sky with the first stars; warm orange light glows from " +
      "the cottage's door and window. A clearly darker, cooler palette than the daytime pages.",
    textZone: { edge: "bottom", fraction: 1 / 3 },
    textSpace: "dark, shadowy grass in the front garden, simple and low in contrast",
    checks: [
      {
        label: "Five flying beans",
        check:
          "exactly five beans (red, gold, green, blue, purple) are flying through the air or lying " +
          "on the ground (count them one by one and say how many you see)",
        fix:
          "Make it exactly five beans flying out over the garden in a loose spray: one red, one " +
          "gold, one green, one blue, one purple.",
      },
      {
        label: "Mother at the window, Jack at the door",
        check: "a woman leans out of a lit window, and Jack stands in the doorway",
        fix: "Show Jack's mother leaning out of the lit window and Jack standing in the open doorway.",
      },
    ],
  },
  {
    // Not in this build. Written down so pages 1–3 leave room for it: page 3
    // keeps a bare patch of soil with open sky above it, and page 4 is made by
    // editing page 3, so the cottage and garden stay the same.
    id: 4,
    title: "The beanstalk at dawn",
    text: null, // storyboard text not written yet
    enabled: false,
    editOf: 3,
    cast: ["cottage"],
    scene:
      "the next morning at dawn. From the bare patch of soil where the beans fell, a gigantic " +
      "beanstalk has grown overnight: a thick, twisting green stalk with huge leaves that climbs " +
      "out of the top of the picture into the clouds.",
    jack:
      "standing in the doorway in the same place as before, looking up at the beanstalk.",
    expression: "astonished: eyebrows high, eyes wide, mouth open in a huge smile",
    light: "dawn: a pale gold and pink sky, soft cool morning light.",
    textZone: { edge: "bottom", fraction: 1 / 4 },
    textSpace: "dewy grass in the front garden, simple and low in contrast",
  },
];

// The two scenes from the last build. They become pages once the full
// 20-page storyboard says where they go.
export const LATER_SCENES = {
  planting:
    "Jack kneels in bare brown dirt in front of the cottage in the evening. With one hand Jack " +
    "drops a few glowing magic beans into a small hole dug in the soil; the other hand holds a " +
    "small garden trowel. Nothing has grown yet: no beanstalk, vines or sprouts.",
  climbing:
    "Jack clings with both hands to a gigantic green beanstalk, high up among the clouds. At the " +
    "top of the picture the beanstalk reaches the clouds, where the giant's castle stands. Far " +
    "below, the ground is a patchwork of fields where the cottage looks tiny.",
};

export function getPage(id) {
  return PAGES.find((p) => p.id === Number(id));
}

export function enabledPages() {
  return PAGES.filter((p) => p.enabled);
}
