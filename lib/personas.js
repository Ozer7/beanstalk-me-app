// ---------------------------------------------------------------------------
// AI feedback: the same short survey the real people answer, put to 10 AI
// reviewers who are actually different from each other.
//
// "Ask the model 10 times" gives 10 copies of one polite answer. Four things
// make these different, and the last one checks that it worked:
//
// 1. A persona grid, not a list of names. Each reviewer differs on several
//    axes at once: who they are to the child (parent, grandparent, teacher,
//    stranger), what they know (illustrator, print shop, librarian, none),
//    age, how much they care, and how they answer surveys. No two share a role
//    or a "lens".
// 2. A lens: the one thing each looks at first (the face, the words, the
//    print quality, the price, the story's fidelity...). Real people notice
//    different things; telling each reviewer what *they* notice first spreads
//    the critiques across the book instead of all landing on the same flaw.
// 3. A temperament and a survey style: some are generous, some hard to
//    please, one is a rushed crowd worker who writes three words, as on
//    CloudResearch. The scores should spread like real scores do.
// 4. Independent calls with different seeds of attention: each reviewer sees
//    the pages in a different order and starts at a different page, and no
//    reviewer sees another's answer.
// 5. A check: every answer is embedded, and any answer too close to an
//    earlier one (cosine similarity above 0.92) is redone once with a
//    different lens. The pairwise similarities are reported, so "different"
//    is a number, not a hope.
// ---------------------------------------------------------------------------
import OpenAI from "openai";

export const QUESTIONS = [
  { id: "likeness", text: "Does the child in the book (Jack) look like the person in the photo?", scale: "1 = not at all, 5 = clearly the same person" },
  { id: "story", text: "Does the story ring true? Does it feel like Jack and the Beanstalk, and do the pictures match the words?", scale: "1 = not at all, 5 = completely" },
  { id: "professional", text: "Does it look professional, like a picture book you could buy in a store?", scale: "1 = homemade, 5 = store quality" },
  { id: "notGood", text: "What isn't good? What would you change first?" },
  { id: "pay", text: "Would you pay 99¢ for the full 20-page version of this book with your own child in it?", options: ["yes", "maybe", "no"] },
];

export const PERSONAS = [
  { id: "p1", name: "Dana, 34", who: "mother of a 5-year-old in Ohio; reads bedtime stories every night", knows: "nothing technical; buys a lot of picture books at Target", lens: "whether her own kid would recognise himself and ask to read it again", temperament: "warm but honest; notices when something feels off for a child", style: "two or three plain sentences per answer" },
  { id: "p2", name: "Harold, 71", who: "grandfather in Florida who would order this as a birthday gift", knows: "nothing about AI; worries about online scams", lens: "whether it looks trustworthy and worth paying for, and whether the text is easy to read", temperament: "skeptical of anything made by computers", style: "formal, a bit long-winded" },
  { id: "p3", name: "Ms. Reyes, 41", who: "kindergarten teacher in Texas", knows: "early reading levels, which words five-year-olds can read", lens: "the words on each page: reading level, length, whether the text and picture agree", temperament: "constructive, practical", style: "numbered points" },
  { id: "p4", name: "Kenji, 29", who: "freelance children's book illustrator", knows: "composition, colour, character consistency, how AI art usually fails", lens: "the art: hands, faces across pages, lighting, whether Jack is the same character on every page", temperament: "hard to impress; specific", style: "dense, uses art terms" },
  { id: "p5", name: "Priya, 38", who: "runs a print shop that prints photo books", knows: "print resolution, margins, bleed, how screens differ from paper", lens: "whether this would print well at 6x9 inches: sharpness, text near edges, colour", temperament: "matter-of-fact", style: "short, technical" },
  { id: "p6", name: "Tom, 45", who: "father of three, works in IT, tried several AI photo apps", knows: "AI image tools and their tells", lens: "the 'uncanny' or obviously-AI parts that would make him not share it with family", temperament: "blunt", style: "casual, a little sarcastic" },
  { id: "p7", name: "Aisha, 23", who: "college student and aunt to a 4-year-old niece; very online", knows: "what looks current on social media", lens: "whether it's cute and giftable, and whether it would look good shared on Instagram", temperament: "enthusiastic but honest about what's 'cringe'", style: "lowercase, quick" },
  { id: "p8", name: "Martin, 58", who: "public children's librarian who has read Jack and the Beanstalk aloud hundreds of times", knows: "the original tale and its versions", lens: "faithfulness to the story: the cow, the beans, the mother, the order of events, the tone", temperament: "gentle but exacting", style: "thoughtful paragraphs" },
  { id: "p9", name: "Jess, 31", who: "crowd worker doing her twentieth survey of the day on CloudResearch", knows: "nothing special", lens: "first impression only", temperament: "neutral, tired", style: "very short: a few words per answer, like a real rushed survey" },
  { id: "p10", name: "Sam, 36", who: "parent of a 6-year-old with glasses and curly hair who is often drawn 'wrong' in toys and apps", knows: "how kids with features that differ from the default feel about likeness", lens: "whether distinctive features (glasses, hair, skin tone, face shape) survived on every page", temperament: "caring, picky about likeness", style: "warm, specific" },
];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["likeness", "story", "professional", "notGood", "pay"],
  properties: {
    likeness: { type: "object", additionalProperties: false, required: ["score", "why"], properties: { score: { type: "integer", minimum: 1, maximum: 5 }, why: { type: "string" } } },
    story: { type: "object", additionalProperties: false, required: ["score", "why"], properties: { score: { type: "integer", minimum: 1, maximum: 5 }, why: { type: "string" } } },
    professional: { type: "object", additionalProperties: false, required: ["score", "why"], properties: { score: { type: "integer", minimum: 1, maximum: 5 }, why: { type: "string" } } },
    notGood: { type: "string" },
    pay: { type: "string", enum: ["yes", "maybe", "no"] },
  },
};

const MODEL = process.env.FEEDBACK_MODEL || process.env.CHECK_MODEL || "gpt-5.4-mini";
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const TOO_SIMILAR = 0.92;
let client = null;
const openai = () => (client ??= new OpenAI());

function prompt(p, pageOrder) {
  return [
    `You are ${p.name}: ${p.who}. You know: ${p.knows}.`,
    `When you look at something like this, the first thing you pay attention to is ${p.lens}.`,
    `Temperament: ${p.temperament}. How you write survey answers: ${p.style}.`,
    "",
    "You are taking a short paid survey. You were shown a photo of a real person and a short personalised picture book",
    "(Jack and the Beanstalk) made from that photo by an app. Answer as yourself, honestly, in your own voice.",
    "Do not be polite for the sake of it, and do not invent problems you can't see. Mention specific pages when you can.",
    `You happened to look at the pages in this order: ${pageOrder.join(", ")}.`,
    "",
    ...QUESTIONS.map((q, i) => `${i + 1}. ${q.text}${q.scale ? ` (${q.scale})` : ""}${q.options ? ` (${q.options.join(" / ")})` : ""}`),
  ].join("\n");
}

async function askOne(p, { photo, pages }, { lensOverride } = {}) {
  const persona = lensOverride ? { ...p, lens: lensOverride } : p;
  // A different reading order per reviewer (rotate by persona number).
  const n = Number(p.id.slice(1));
  const order = pages.map((_, i) => (i + n) % pages.length);
  const content = [
    { type: "input_text", text: prompt(persona, order.map((i) => pages[i].label)) },
    { type: "input_text", text: "The photo:" },
    { type: "input_image", detail: "low", image_url: photo },
    ...order.flatMap((i) => [
      { type: "input_text", text: pages[i].label + (pages[i].words ? ` (printed words: "${pages[i].words}")` : "") },
      { type: "input_image", detail: "high", image_url: pages[i].image },
    ]),
  ];
  const res = await openai().responses.create({
    model: MODEL,
    reasoning: { effort: "low" },
    input: [{ role: "user", content }],
    text: { format: { type: "json_schema", name: "survey", schema: SCHEMA, strict: true } },
  });
  return JSON.parse(res.output_text);
}

const asText = (a) => [a.likeness.why, a.story.why, a.professional.why, a.notGood].join(" ");
const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; } return d / Math.sqrt(x * y); };
async function embed(texts) {
  const r = await openai().embeddings.create({ model: EMBED_MODEL, input: texts });
  return r.data.map((d) => d.embedding);
}

const SPARE_LENSES = [
  "the very last page and how the book ends",
  "the background details and the setting rather than Jack",
  "how the other characters (the mother, the cow, the old man) look",
  "how a child would react on first sight",
];

/**
 * book: { photo: dataURL, pages: [{ label, words, image: dataURL }] }
 * onProgress(msg) gets { done, total, persona } as answers come in.
 */
export async function runAiFeedback(book, onProgress = () => {}) {
  const t0 = Date.now();
  let done = 0;
  const answers = await Promise.all(PERSONAS.map(async (p) => {
    const a = await askOne(p, book);
    onProgress({ done: ++done, total: PERSONAS.length, persona: p.name });
    return { persona: p, answer: a, redone: false };
  }));

  // The diversity check.
  let vecs = await embed(answers.map((r) => asText(r.answer)));
  let spare = 0;
  for (let i = 1; i < answers.length; i++) {
    const max = Math.max(...vecs.slice(0, i).map((v) => cos(v, vecs[i])));
    if (max > TOO_SIMILAR && spare < SPARE_LENSES.length) {
      const lens = SPARE_LENSES[spare++];
      answers[i] = { persona: answers[i].persona, answer: await askOne(answers[i].persona, book, { lensOverride: lens }), redone: true, newLens: lens, wasSimilarity: Number(max.toFixed(3)) };
      [vecs[i]] = await embed([asText(answers[i].answer)]);
    }
  }
  const sims = [];
  for (let i = 0; i < vecs.length; i++) for (let j = i + 1; j < vecs.length; j++) sims.push(cos(vecs[i], vecs[j]));
  const mean = sims.reduce((a, b) => a + b, 0) / sims.length;
  const scores = (k) => answers.map((r) => r.answer[k].score);
  return {
    model: MODEL,
    embedModel: EMBED_MODEL,
    ms: Date.now() - t0,
    answers,
    diversity: { meanSimilarity: Number(mean.toFixed(3)), maxSimilarity: Number(Math.max(...sims).toFixed(3)), minSimilarity: Number(Math.min(...sims).toFixed(3)), redone: answers.filter((r) => r.redone).length },
    summary: Object.fromEntries(["likeness", "story", "professional"].map((k) => [k, { mean: Number((scores(k).reduce((a, b) => a + b, 0) / scores(k).length).toFixed(2)), scores: scores(k) }])),
    pay: Object.fromEntries(["yes", "maybe", "no"].map((v) => [v, answers.filter((r) => r.answer.pay === v).length])),
  };
}
