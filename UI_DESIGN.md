# Dashboard design

Reading this as: a research dashboard and live demo for a student security study, shown to examiners and peers on a laptop or projector, in a lab-notebook and journal-figure style. Dial: ENERGY 2 / RHYTHM 2 / MOTION 1.

## Identity

The dashboard is evidence first: emails, pages, verdicts and measured numbers are the content, and the chrome stays quiet around them. One motif repeats everywhere: **what the filter withholds is shown as a black redaction bar**, and **injected text is marked in vermilion**, the way an editor marks a manuscript. Both come straight from what the system does: a blocked document is replaced by a placeholder, and an injection is foreign text inside a trusted document.

## Decisions and reasons

| Decision | Reason |
|---|---|
| Warm paper background (`#f4f1ea`), white sheets for reading surfaces | Reads as a printed report, and separates "document being read" from the instrument around it. |
| Light theme only, no toggle | The content is long-form text and figures shown on projectors, where light backgrounds hold contrast best. |
| One accent, vermilion `#b3341a`, used only for attacks and hijacks | The single thing the audience must notice is where the attack is and whether it worked. |
| Black redaction bar for "withheld" | Shows literally what the filter does to a document. |
| Ochre for model mistakes that are not attacks (invented addresses, wrong answers) | Keeps the accent reserved for attacks. |
| Five muted data colours, one per defence, used only in charts and swatches | Defences must stay identifiable across every page and figure; they never colour UI chrome. |
| Prompt Guard 2 drawn hatched | It is a reference row, not a contestant, and the hatching says so in every chart. |
| Source Serif 4 for headings, emails, replies and prose | Journal voice, and long emails read better in a serif. |
| IBM Plex Sans for controls and labels | Engineered, neutral, and pairs with Plex Mono. |
| IBM Plex Mono only for raw sources, scores and timings | Raw HTML and numbers are what the model reads and what was measured, so they look like data. |
| Fonts self-hosted in `fonts/` | The demo has to work with no network. |
| Numbered figures with captions, takeaways under each | Results are presented the way the write-up presents them, each chart answering a stated question. |
| Overview leads with the trade-off scatter (attacks blocked vs harmless emails wrongly blocked) | That trade-off is the project's main finding and the reason a "which defence when" table exists. |
| Outcome tables (rows per defence) instead of cards | Defences are compared on the same columns, so a table lets the eye run down a column. |
| Rules (1px lines) instead of shadows and boxes | Hierarchy comes from type and spacing; only the dialog is elevated, because it sits above the page. |
| Radii: 3px controls, 6px sheets | Small and consistent; nothing is pill-shaped. |
| Motion: hover and state transitions only, a spinner while a model runs | Model calls take seconds, so the only motion is the honest "working" signal. |
| Presenter switch "Show attacks" | Lets the presenter demonstrate blind first, then reveal where the injection was. |
