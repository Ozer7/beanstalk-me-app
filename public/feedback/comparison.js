// The written comparison of the 10 real responses and the 10 AI responses
// (Nov 2 2026). The numbers on the page are computed live from the data; this
// is the reading of it.
window.COMPARISON = {
  humanOnly: [
    "<b>The six-fingered hand.</b> One person spotted the old man's extra finger on page 2 (\"common AI glitch\"). No AI reviewer named it; the print-shop persona only said \"a few hands/feet look slightly artificial\".",
    "<b>Blurry, \"not HD\" backgrounds</b>, especially the countryside behind page 2. No AI reviewer mentioned sharpness.",
    "<b>The mother looks too happy on page 3</b>, where she's supposed to be furious about the beans.",
    "<b>Move About Me to the front</b>, so the reader knows why the book exists before reading it.",
    "<b>\"Too Disney\" and \"too glossy, it makes it look cheap\".</b> People named specific looks they disliked; the AI said \"generic\" but never compared it to a studio or called it cheap.",
    "<b>Real indifference.</b> One person had nothing to criticise and told the interviewer to stop asking. Every AI reviewer found something to fix.",
  ],
  aiOnly: [
    "<b>The About Me page says \"Age 22\" and \"I am learning Computer Science\"</b>, which doesn't fit a children's book. 7 of 10 AI reviewers flagged it (and all 10 brought up the About Me page); no person did (they could see the photo was an adult and took it in stride).",
    "<b>A grown man shrunk into a child's body.</b> Two personas (the IT dad and the student aunt) called it uncanny: an adult face with a beard and glasses on a storybook-child body.",
    "<b>Reading level.</b> The kindergarten-teacher persona said some sentences are too long for five-year-olds to read alone.",
    "<b>Tone on page 2.</b> The librarian persona said the cow-for-beans trade is played too cheerful for what should be a grim bargain.",
    "<b>Craft details</b> people don't name: stiff poses and body proportions shifting between pages (illustrator), awkward line breaks and text close to the bottom margin (print shop).",
  ],
  both: [
    "<b>Likeness comes from the glasses, beard and smile.</b> Both sides scored likeness ~4 for the same reasons.",
    "<b>Head shape is off.</b> One person and one AI persona (the parent watching for distinctive features) both said the head is drawn a different shape than in the photo.",
    "<b>It looks AI-generated.</b> Half the people and most AI reviewers said the 3D style feels generic, synthetic or glossy rather than illustrated.",
    "<b>The story is compressed.</b> Three people said it's rushed; the librarian and teacher personas said the same.",
  ],
  overall: [
    "<b>The AI was more polite and more alike.</b> Its scores sat between 3 and 4 on every question; people used the whole scale (a 1 and a 5 for professional, a 2 and two 5s for story). On the 99¢ question, 9 of 10 AI reviewers said \"maybe\" and none said no; people split 4 yes, 3 maybe, 3 no. The AI hedges where people commit.",
    "<b>The AI was more thorough, people more surprising.</b> AI answers cite pages and give several reasons; people give one gut reason, but that's where the single sharpest catches came from (the extra finger, the blurry background, the happy mother).",
    "<b>Different personas still converge on the loudest flaw.</b> The lenses spread attention (reading level, print, tone, likeness), but all 10 brought up the About Me page and 7 flagged its \"Age 22\". The embedding check passed (average similarity 0.83, highest 0.91, nothing redone), so the wording differed, but the main point didn't. Next time: hide the About Me details from all but one persona, or ask each persona to skip anything another lens owns.",
    "<b>The tired-crowd-worker persona was the most human-like</b>: short, a 4 on most things, one complaint. The expert personas read like reviewers, not customers.",
    "<b>Used together they're better than either.</b> The AI found real problems people walked past (an adult's age in a child's book, reading level), and people found visual glitches the AI missed. Both are now in to-do.md, and the painted style, hands check, angry mother and head-shape rule are already in the app.",
  ],
};
