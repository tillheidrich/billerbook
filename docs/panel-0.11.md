# Expert panel for Billerbook 0.11

Date: 2026-11-22. Input: Billerbook 0.10 (editor screenshot, print profiles, MCP tools), the gap list against Lightroom's Book module and Blurb BookWright, and Till's request for a list of used files.

The panel is simulated. Each person stands for a group of real users or a discipline. Their objections were turned into requirements, and every requirement below is either built in 0.11 or listed under "not now" with a reason.

## The panel

| Persona | Looks at Billerbook as | First question |
|---|---|---|
| **Till**, makes a yearly family book from Lightroom, ADHD | owner, three editions, little time in December | "Which files are in the book, and can I find them again in Lightroom and the Finder?" |
| **Wedding photographer**, 20 albums a year, Saal layflat | professional, client approval, deadlines | "How does my client approve the album without me sending 30 screenshots?" |
| **Prepress operator** at a print shop | receives the PDFs | "Fonts embedded or outlined? Barcode 100 % K? Ink limit? Do you show the CMYK shift before I see it?" |
| **Book typographer** | judges the text pages | "Helvetica and Times in a photo book? Where are leading, tracking, small caps, real italics?" |
| **Self-publisher** selling a photo book via KDP and IngramSpark | ISBN, retail, distribution | "Where does the barcode go, and does it pass IngramSpark's check?" |
| **Grandmother** who receives the book and proofreads it | end reader, tablet, email | "Can I look at it before it is printed, on my iPad?" |
| **UX and accessibility reviewer** | interaction and cognitive load | "Nine features: where do they live, so the inspector does not turn into a cockpit?" |
| **AI power user** working through MCP | lets Claude build the book | "Can the assistant do every one of these, and can it check its own result?" |

## Findings and what they changed

### Typographer: standard PDF fonts are not good enough
Text was set in Helvetica or Times, the two families every PDF reader has built in. A photo book with a title page in Times looks like an office document. Text size, alignment and colour already existed per text in the PDF, but the editor ignored them, so screen and print could differ.

Changes:
- Billerbook ships nine open-licence families (EB Garamond, Source Serif 4, Cormorant Garamond, Playfair Display, DM Serif Display, Work Sans, Jost, Archivo, Caveat) and accepts your own TTF or OTF files.
- Text is written into the PDF as outlines. Nothing can go missing at the print shop, and any font works, also one without an embedding licence bit.
- Text styles per edition: family, weight, italic, size, leading, tracking, capitals, colour, alignment. The five roles (title, body, caption, spine, back) are styles you can edit; you can add your own. Changing a style changes every text that uses it.
- The editor renders with the same font files and the same values as the PDF.
- Preflight warns when text does not fit its frame and when text is below 6 pt.

### Prepress operator: show the colour shift, keep black clean
Changes:
- Soft proof in the editor (key `P`): every photo is shown after a round trip through the printer's CMYK profile (the one set in the edition, otherwise a generic coated CMYK). Optional gamut warning marks pixels that shift visibly.
- The barcode is drawn as vector bars in 100 % K on a white field, never as an image.
- Built-in graphics use lines no thinner than 0.3 mm, because finer lines break up in print.
- A proof PDF draws trim, bleed, safe area and glue zone on every page and lists all preflight messages on a first page, so the print shop and the author talk about the same page numbers.

### Wedding photographer: client approval and quick exports
Changes:
- Screen PDF: small, RGB, cut to the trim, as double pages. Made for email and tablets.
- JPEG export of pages or double pages from the original files, in a chosen width. Also a 4:5 carousel export that splits a double page into two 1080 × 1350 slides for Instagram.
- Black-and-white and toning per photo (neutral, warm, cool, sepia, selenium) without touching the original, visible in the editor and in every export.

### Till: find the files again
Changes:
- File list per edition as TXT (one path per line, ready to paste) and CSV (page, frame, file name, full path, Lightroom ID, effective resolution).
- "Collect originals": copies every used original into one folder, named by page number, for archiving or for a retoucher.
- The Lightroom plug-in from 0.10 stays the main way back into Lightroom, because collections survive renames and moves; the list is for the Finder and for other people.

### Self-publisher: ISBN and barcode
Changes:
- ISBN field on the cover. Billerbook checks the check digit, converts ISBN-10, and draws an EAN-13 barcode with an optional 5-digit price add-on.
- The barcode size follows the GS1 standard size and can be scaled between 80 and 100 %; preflight warns below that.
- Per print profile: KDP gets a white placeholder (KDP prints its own barcode on that spot), IngramSpark requires a barcode and preflight says so when it is missing.

### Grandmother: reading it before print
Changes:
- The screen PDF above, plus an EPUB 3 fixed-layout file (one page per screen, captions as alt text) for Apple Books and Tolino.

### UX reviewer: one place for output
Nine features in the inspector would bury the layout tools. Decision:
- Everything that produces files lives in the Export dialog, grouped as "Print", "Check", "Share" and "Files". The dialog shows the preflight state at the top, so checking comes before printing without a separate wizard.
- Text styles get their own panel in the inspector, which only opens when a text is selected or from the edition settings.
- Tone and background graphic sit in the existing "more" sections for photos and pages.
- Soft proof is a toggle in the top bar with the key `P`, because you switch it on and off while looking.

### AI power user: every feature as a tool
Changes:
- MCP tools for text styles and fonts, tone, background graphics, barcode, file list, JPEG, proof PDF, screen PDF and EPUB export, and soft-proofed spread previews, so the assistant can look at the CMYK result before it reports back.

## Not now
- **Hyphenation and justified text.** Justified text without good hyphenation looks worse than ragged text. Captions in photo books are mostly short. Revisit when someone sets long essays.
- **Small caps from OpenType features.** The capitals option with tracking covers the common case.
- **Spot colours and varnish.** No print shop in the profile list accepts them through PDF upload for photo books.
