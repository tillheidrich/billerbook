#!/usr/bin/env python3
"""Generates the Billerbook marketing site (English at /, German at /de/).
Edit the copy in T below, run `CONTACT_EMAIL=... python3 build.py`, commit, push. Coolify serves `public/`.
The contact address for imprint and privacy pages comes from the CONTACT_EMAIL environment variable."""
import os, sys, html, shutil

REPO = "https://github.com/tillheidrich/billerbook"
DL = REPO + "/releases/latest"
VERSION = "0.13.0"
BASE = "https://billerbook.heidrich-digital.de/"

ARROW = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M6 4h6v6"/></svg>'
DOWN = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v9M4 7l4 4 4-4M3 14h10"/></svg>'

T = {
 "en": dict(
  lang="en", path="", other="/de/", other_label="Deutsch", other_short="DE",
  title="Billerbook: free photo book layout app for Mac, print-ready PDFs for Blurb, KDP, Lulu and any print shop",
  desc="Open-source photo book editor for macOS. Lay out with drag and drop and one-key cropping, see in Lightroom Classic which photos are in the book, and export print PDFs for Blurb, Amazon KDP, Lulu, IngramSpark, Mixam, Saal Digital, WIRmachenDRUCK or any print shop that takes PDF.",
  nav=["Features", "Editions", "Print", "FAQ"],
  eyebrow="Free and open source · macOS",
  h1="Lay out photo books <span class='hl'>fast.</span> Print them anywhere.",
  lead="Billerbook is a photo book editor for the Mac. Drop in a folder or a Lightroom collection, flip through layouts with the space bar, and export a PDF with bleed, spine and cover at the sizes your print shop specifies.",
  dl="Download for Mac", dl_short="Download", gh="View on GitHub",
  meta=f"Version {VERSION} · Apple silicon and Intel · AGPL-3.0",
  facts=[("1 key", "switches a photo between full page and fitted"), ("Any number", "of editions from the same photos, each in its own format"), ("Offline", "your photos stay on your Mac, there is no account")],
  story_num="Why it exists",
  story=["Every year I made a family photo book the same way. <strong>Pick the photos in Lightroom, lay them out in the Book module, export, then repair the PDF in InDesign</strong> until the print shop stopped complaining about bleed.",
         "Then I made a portrait softcover with fewer pages for the relatives, <strong>which meant doing most of it again.</strong> Cropping a photo to fill a page, or back, took far too many clicks.",
         "Billerbook is the tool I wanted instead. It runs on your Mac, leaves your originals untouched, and writes PDFs with the trim, bleed and cover sizes print shops ask for."],
  feat_eyebrow="What it does", feat_h="Fast where layout usually gets <span class='hl'>slow.</span>",
  feat_lead="The parts that cost the most time in other tools are single keystrokes here.",
  cards=[
   ("w7", "Crop without the fiddling", "Pick a crop ratio like in Lightroom (square, 4:5, 3:2, 16:9, panorama), drag inside the frame to move the photo, scroll to zoom. F toggles between filling the frame and showing the whole photo. V makes it a full-bleed page. Portrait photos on landscape pages get the full page height. Billerbook finds the subject of each photo, so automatic crops keep faces and horizons in view.", "app-editor-012.webp", None),
   ("w5", "Keyboard first", "Space cycles through arrangements of the photos already on the page. Number keys pick a layout with that many photos. Cmd+D duplicates a page.", None, "keys"),
   ("w5", "Ask your AI to build the book", "Billerbook includes an MCP server with 51 tools for Claude, ChatGPT, Codex or Cursor. Connect ChatGPT or claude.ai with a six-digit code from the app. The assistant reads a folder, a web page or your print shop's data sheet, sets up the print profile, lays out the book, looks at every spread as an image and fixes the ones that don't work. You check the result in the app.", None, "prompt"),
   ("w7", "Your print shop, its rules", "208 formats from Blurb, Amazon KDP, Lulu, IngramSpark, Mixam, Saal Digital, CEWE, WhiteWall, PrestoPhoto and WIRmachenDRUCK, plus standard photo book, book and magazine sizes and a special size for every binding. The spine width follows from page count and paper, using the printer's own formula or table. Hand your assistant the print shop's data sheet PDF and it sets up trim, bleed, cover and page rules from it. Magazines come with saddle stitching and a separate four-page cover if the printer wants one.", "app-printsettings.webp", None),
   ("w6", "In the book, and visible in Lightroom", "Billerbook reads your Lightroom Classic catalog and never writes to it, and lays out in the order of your collection, custom order included. The optional plug-in exports the print files with your edits, keeps a collection per edition in Lightroom and one with the photos still missing. Books from the Book module import with their pages, and the 240-page limit is gone: that one comes from Blurb, not from your book.", "app-overview-012.webp", None),
   ("w6", "Fifteen book styles", "From a quiet monograph to loud backstage: Reportage in black and white on dark paper, Chronicle with place and date under every photo, Cinematic with lots of full bleed, Street, and the classic lab look. Apply one to a finished book and it takes the style while your own pages stay. Preview with your own photos first.", "app-templates-013.webp", None),
   ("w6", "Everything the Book module does", "Duplicate pages, copy a layout to the next page or to every page with the same number of photos, save your own layouts, set a background photo with opacity, change margin and gap on one page, hide a page number.", "app-pagetools.webp", None),
   ("w6", "Cover with a real spine", "The cover is sized from page count and paper, including spine width, turn-in and hinge. Billerbook sets the title and spine text, and you can change both. Preflight warns about low resolution, the glue zone, page limits and an estimated spine before you pay.", "app-cover-012.webp", None),
  ],
  klabels=["Cropping", "Keyboard", "AI assistants", "Print shops", "Lightroom Classic", "Styles", "Pages", "Cover"],
  hero_caps=["Billerbook on macOS · hardcover A4 landscape", "Export: softcover portrait, same photos"],
  keys=[("Space", "next arrangement"), ("F", "fill ⇄ fit"), ("V", "full bleed"), ("1–9", "photos per page"), ("⌘D", "duplicate page"), ("⇧⌘C ⇧⌘V", "copy, paste layout")],
  prompt='<b>You:</b> Make a 60-page landscape book from ~/Pictures/Iceland 2026. Keep the 5-star shots on their own pages.\n<b>Assistant:</b> Created the edition Hardcover, 60 pages, 142 photos. Spread 14 had two horizon shots stacked; switched it to a full-bleed pair. Preflight is clean.',
  ed_eyebrow="Editions", ed_h="<span class='hl'>Several books</span> from one set of photos.",
  ed_lead="A detailed landscape hardcover for yourself and a shorter portrait softcover for the family can share the same photo pool. Each edition has its own format, page count and layouts. Layouts adapt when the format changes.",
  ed_caps=["<b>Hardcover, landscape.</b> 297 × 210 mm, the long version.", "<b>Softcover, portrait.</b> 210 × 297 mm, fewer pages, same photos."],
  how_eyebrow="How it works", how_h="From folder to print shop in four steps.",
  steps=[("Add photos", "Drag in a folder, pick a Lightroom collection, or let your AI assistant do it."),
         ("Pick a format", "Choose a print profile and a size. Bleed, safety margin and glue zone come with it."),
         ("Lay out", "Auto-fill makes a first draft. Then you change spreads with the keyboard or by dragging photos."),
         ("Export", "Interior and cover as separate PDFs, RGB or CMYK with an ICC profile, ready to upload.")],
  pr_eyebrow="Print shops", pr_h="Ten print shops and 208 formats built in. <span class='hl'>Any other</span> from its data sheet.",
  pr_lead="Billerbook writes standard print PDFs with trim and bleed boxes, embedded output intent and images at full resolution. A print profile holds what differs between shops. For a shop that is not listed, import its cover template or enter its numbers once and export them as a profile.",
  spec=[("Bleed", "3 mm"), ("Safety margin", "5 mm"), ("Glue zone, hardcover", "7 mm"), ("Cover", "spine from page count"), ("Colour", "RGB or CMYK + ICC"), ("Profiles", "WIRmachenDRUCK, custom")],
  spec_note="The values above come from the WIRmachenDRUCK profile, checked against the shop's data sheets and real printed books. The custom profile lets you set every number for another shop.",
  shops_label="Built-in print profiles", shops_slug="print-shops", shops_more="Specs, sources and formats for every print shop →",
  shops_title="Print shops and formats in Billerbook: Blurb, Amazon KDP, Lulu, IngramSpark, CEWE, WhiteWall, Saal Digital, Mixam and more",
  shops_desc="Bleed, page rules, spine width and cover measurements Billerbook uses for each print shop, with links to the printers' own specifications.",
  shops_h1="Print shops", shops_intro="Billerbook writes standard print PDFs, so any print shop that accepts PDF uploads can print your book. These profiles are built in. Every number comes from the printer's own published specification; the links are below each profile. Where a printer gives the cover size only through its own calculator, you import the cover template it generates and Billerbook takes the exact size from it.",
  status_names={"verified": "verified", "partial": "partly verified, cover via template", "manual": "your values"},
  col=["Print shop", "Region", "Interior", "Spine"], interior_names={"single": "single pages", "spreads": "spreads"},
  spine_names={"formula": "printer's formula", "table": "printer's table", "printer": "printer's calculator or template"},
  lbl_bleed="Bleed", lbl_safety="Safety margin", lbl_pages="Pages", lbl_colour="Colour", lbl_cover="Cover", lbl_formats="Formats", lbl_papers="Papers", lbl_sources="Sources", lbl_checked="Checked",
  lbl_wrap="wrap", lbl_joint="extra per spine side", lbl_hinge="hinge", lbl_blank="first and last page empty", lbl_any="Your print shop is missing? Import its cover template, or enter its numbers once and export them as a profile. Send the profile with a link to the printer's specification and it goes into the next release.",
  faq_h="Questions",
  faq=[("Is it really free?", "Yes. Billerbook is open source under the AGPL-3.0 licence. There is no paid tier, no account and no trial."),
       ("Does it work with Blurb?", "Yes, through Blurb's PDF to Book upload. Billerbook knows Blurb's photo book sizes, the single-page interior with 1/8 in bleed and the page limits per paper. Blurb gives the exact cover size only in its specification calculator, so you download Blurb's cover template there and import it."),
       ("Can I print a photo book with Amazon KDP or Lulu?", "Yes. For KDP and Lulu paperbacks Billerbook uses the spine formulas the two publish, so the cover is exact without a template. For hardcovers it uses Lulu's spine table or the cover template from the printer."),
       ("Which other print shops work?", "Any shop that takes print PDFs. Built in are also WIRmachenDRUCK, Saal Digital, CEWE (PDF to Book), WhiteWall, Mixam, IngramSpark and PrestoPhoto, 208 formats in all, and every binding has a special size with free width and height. For other shops you give your AI assistant the shop's data sheet PDF, or enter bleed, margins and cover numbers once and export them as a profile."),
       ("Can I make a magazine or a booklet?", "Yes. Saddle stitching is a binding of its own: pages in steps of four, A4, A5, 23 × 30 cm, US Letter and other sizes. The cover is either the first and last pages of the interior or a separate four-page PDF (U1 to U4) for a heavier cover paper."),
       ("Can ChatGPT or Claude build the book for me?", "Yes. Claude Desktop, Codex and Cursor connect locally. ChatGPT and claude.ai connect over OAuth: Billerbook opens a tunnel, you add the address as a connector and approve it with a six-digit code from the app. Remote assistants work only on your photo book projects; they get no access to other files on your Mac."),
       ("Can I put the book on my website?", "Yes. Export it as an interactive HTML book that pages with arrow keys and swipes and keeps the text readable for search engines, with a snippet for Astro or any other site. EPUB, Instagram carousels, page images and a small screen PDF are also there."),
       ("How does Billerbook know the spine width?", "From the printer: its formula or table for the paper and page count where it publishes one, otherwise from the cover template you download from the printer, or the value you enter. Until then Billerbook shows an estimate, marks it as one and warns before export."),
       ("Is there a page limit like the 240 pages in Lightroom?", "No. That limit belongs to Blurb, which Lightroom's Book module is built on. Billerbook has none; the only limit is what your print shop binds, and preflight checks it for the shops whose limits are known."),
       ("Can I see in Lightroom which photos are in the book?", "Yes, with the Lightroom Classic plug-in. It keeps a collection per edition under Billerbook in the Collections panel, and a second one with the photos from your Lightroom selection that are not in that edition yet."),
       ("Does it run on Windows or Linux?", "The download is a Mac app. The editor itself is a local web app written in Node.js, so it also runs on Windows and Linux from source. Instructions are in the README."),
       ("Do I need Lightroom?", "No. A folder of JPEGs is enough. Lightroom Classic support is there for people who already select their photos there."),
       ("Does it work with Capture One or Affinity?", "Yes. On the Mac, Billerbook reads albums, projects and groups from the catalog or session open in Capture One; for printing you process the album into a folder and Billerbook matches the files by name. Every book also exports as IDML, which Affinity (free) and InDesign open as an editable layout with image and text frames, so you can finish it there."),
       ("Can I see the whole book at once?", "Yes. The overview tab shows every spread, and the page overview PDF puts them on A4 sheets with page numbers, for sign-off before you order."),
       ("Do my photos leave my computer?", "No. Everything runs locally. The app only goes online to check for updates."),
       ("How do updates work?", "The Mac app checks GitHub releases and installs new versions after you confirm.")],
  sc_slug="botanical-stories", sc_nav="Example book",
  sc_title="Botanical Stories: a 170-page photo book made with Billerbook from 22 garden visits",
  sc_desc="Glasshouses and botanical gardens from Greifswald to Tenerife, laid out as a monograph in Billerbook: imported from the galleries on tillheidrich.de, botanical template, ready for print. Page through the interactive book.",
  sc_eyebrow="Made with Billerbook", sc_h1="Botanical <span class='hl'>Stories</span>",
  sc_lead="Glasshouses and gardens, 2019 to 2024: Greifswald, Amsterdam, Leiden, Copenhagen, Aarhus, Utrecht, Hanover, Hamburg, Gran Canaria, Tenerife. 118 photos, 22 chapters, 170 pages in A4 landscape.",
  sc_book_h="Page through the book", sc_book_note="Arrow keys or swipe. The interactive book is Billerbook's HTML export, embedded as it comes out of the app.",
  sc_how_h="How it was made",
  sc_how=[("22 web pages in, one book out", "Each garden is a gallery on tillheidrich.de. The web import read every gallery page, took eight photos evenly spread over each, and turned the title into a chapter page and the text into a text page."),
          ("A template, then a rhythm", "The botanical template set warm paper, Cormorant Garamond and plates in the classic canon margins. Each chapter opens on a right page, starts with a full-bleed spread and alternates plates, small photos with white, and diptychs, the way monographs by photographers are paced."),
          ("Checked before print", "Preflight flags every photo that is too small for print. The web galleries hold screen-size JPEGs, so the print edition takes the originals from Lightroom; the web and social versions use what you see here."),
          ("Out in every format", "From the same project: print PDFs with a cover in PDF/X-4, the interactive HTML book on this page, an Instagram carousel, a screen PDF and the double-page images used across this site.")],
  sc_spreads_h="Some spreads", sc_galleries="The galleries on tillheidrich.de",
  sc_cta="Make your own book",
  final_h="Download Billerbook and open a folder of photos.",
  foot_by='Made by <a href="https://tillheidrich.de">Till Heidrich</a> in Tostedt, Germany.',
  imprint="Imprint", privacy="Privacy", source="Source code",
 ),
 "de": dict(
  lang="de", path="de/", other="/", other_label="English", other_short="EN",
  title="Billerbook: kostenlose Fotobuch-App für den Mac, Druck-PDFs für WIRmachenDRUCK, Saal, Blurb und jede Druckerei",
  desc="Open-Source-Fotobuch-Editor für macOS. Gestalten per Drag & Drop und Zuschnitt per Taste, in Lightroom Classic sehen, welche Fotos im Buch sind, und Druck-PDFs exportieren für WIRmachenDRUCK, Saal Digital, Blurb, Amazon KDP, Lulu, Mixam oder jede Druckerei, die PDF annimmt.",
  nav=["Funktionen", "Editionen", "Druck", "FAQ"],
  eyebrow="Kostenlos und Open Source · macOS",
  h1="Fotobücher <span class='hl'>schnell</span> gestalten. Überall drucken.",
  lead="Billerbook ist ein Fotobuch-Editor für den Mac. Ordner oder Lightroom-Sammlung reinziehen, mit der Leertaste durch Layouts blättern und ein PDF mit Beschnitt, Buchrücken und Umschlag in den Maßen exportieren, die deine Druckerei vorgibt.",
  dl="Für Mac laden", dl_short="Laden", gh="Auf GitHub ansehen",
  meta=f"Version {VERSION} · Apple Silicon und Intel · AGPL-3.0",
  facts=[("1 Taste", "macht aus einem Foto eine volle Seite und zurück"), ("Beliebig viele", "Editionen aus denselben Fotos, jede im eigenen Format"), ("Offline", "deine Fotos bleiben auf dem Mac, ein Konto gibt es nicht")],
  story_num="Warum es das gibt",
  story=["Jedes Jahr habe ich unser Familien-Fotobuch gleich gebaut. <strong>Fotos in Lightroom auswählen, im Buch-Modul layouten, exportieren und das PDF in InDesign reparieren</strong>, bis die Druckerei nicht mehr über den Beschnitt meckerte.",
         "Danach habe ich ein Softcover hochkant mit weniger Seiten für die Verwandtschaft gemacht, <strong>also das meiste noch einmal.</strong> Ein Foto auf die ganze Seite ziehen oder zurück kostete jedes Mal viel zu viele Klicks.",
         "Billerbook ist das Werkzeug, das ich stattdessen haben wollte. Es läuft auf deinem Mac, verändert deine Originale nicht und schreibt PDFs mit den Endformat-, Beschnitt- und Umschlagmaßen, die Druckereien verlangen."],
  feat_eyebrow="Was es kann", feat_h="Schnell, wo Layout sonst <span class='hl'>zäh</span> wird.",
  feat_lead="Was in anderen Programmen am meisten Zeit kostet, ist hier ein Tastendruck.",
  cards=[
   ("w7", "Zuschneiden ohne Gefummel", "Seitenverhältnis wählen wie in Lightroom (quadratisch, 4:5, 3:2, 16:9, Panorama), im Rahmen ziehen verschiebt das Foto, Scrollen zoomt. F wechselt zwischen randfüllend und ganzem Foto. V macht daraus eine randlose Seite. Hochformate auf Querseiten bekommen die volle Seitenhöhe. Billerbook erkennt das Motiv jedes Fotos, damit automatische Ausschnitte Gesichter und Horizonte im Bild behalten.", "app-editor-012.webp", None),
   ("w5", "Tastatur zuerst", "Die Leertaste blättert durch Anordnungen der Fotos auf der Seite. Zifferntasten wählen ein Layout mit so vielen Fotos. Cmd+D dupliziert eine Seite.", None, "keys"),
   ("w5", "Lass deine KI das Buch bauen", "Billerbook bringt einen MCP-Server mit 51 Werkzeugen für Claude, ChatGPT, Codex oder Cursor mit. ChatGPT und claude.ai verbindest du mit einem sechsstelligen Code aus der App. Der Assistent liest einen Ordner, eine Webseite oder das Datenblatt deiner Druckerei, richtet das Druckprofil ein, legt das Buch an, sieht sich jede Doppelseite als Bild an und ändert die, die nicht funktionieren. Du prüfst das Ergebnis in der App.", None, "prompt"),
   ("w7", "Deine Druckerei, ihre Regeln", "208 Formate von WIRmachenDRUCK, Saal Digital, CEWE, WhiteWall, Blurb, Amazon KDP, Lulu, IngramSpark, Mixam und PrestoPhoto, dazu gängige Fotobuch-, Buch- und Magazinformate und ein Sonderformat für jede Bindung. Die Rückenbreite folgt aus Seitenzahl und Papier, nach Formel oder Tabelle der Druckerei. Gib deinem Assistenten das Datenblatt der Druckerei als PDF, dann richtet er Endformat, Beschnitt, Umschlag und Seitenregeln danach ein. Magazine gibt es mit Rückendrahtheftung und auf Wunsch mit separatem vierseitigem Umschlag.", "app-printsettings.webp", None),
   ("w6", "Im Buch, und in Lightroom sichtbar", "Billerbook liest deinen Lightroom-Classic-Katalog, schreibt nie hinein und gestaltet in der Reihenfolge deiner Sammlung, auch einer eigenen. Das Plug-in exportiert die Druckdateien mit deinen Entwicklungen, legt eine Sammlung je Edition an und eine mit den Fotos, die noch fehlen. Bücher aus dem Buch-Modul kommen samt Seiten mit, und die 240-Seiten-Grenze fällt weg: Die kommt von Blurb, nicht von deinem Buch.", "app-overview-012.webp", None),
   ("w6", "Fünfzehn Buchstile", "Von der ruhigen Monografie bis Backstage: Reportage in Schwarzweiß auf dunklem Papier, Zeitdokument mit Ort und Datum unter jedem Foto, Kinematisch mit viel Randlosem, Straße und der klassische Fotobuch-Look. Auf ein fertiges Buch angewendet übernimmt es den Stil, deine eigenen Seiten bleiben. Vorher mit deinen Fotos ansehen.", "app-templates-013.webp", None),
   ("w6", "Alles, was das Buch-Modul kann", "Seiten duplizieren, ein Layout auf die nächste Seite oder alle Seiten mit gleich vielen Fotos übertragen, eigene Layouts speichern, Hintergrundfoto mit Deckkraft, Rand und Abstand je Seite, Seitenzahl ausblenden.", "app-pagetools.webp", None),
   ("w6", "Umschlag mit echtem Buchrücken", "Der Umschlag wird aus Seitenzahl und Papier berechnet, mit Rückenbreite, Einschlag und Falz. Billerbook setzt Titel und Rückentext, du kannst beides ändern. Die Prüfung meldet zu geringe Auflösung, die Klebezone, Seitengrenzen und einen geschätzten Rücken, bevor du bezahlst.", "app-cover-012.webp", None),
  ],
  klabels=["Zuschnitt", "Tastatur", "KI-Assistenten", "Druckereien", "Lightroom Classic", "Stile", "Seiten", "Umschlag"],
  hero_caps=["Billerbook am Mac · Hardcover A4 quer", "Export: Softcover hochkant, dieselben Fotos"],
  keys=[("Leertaste", "nächste Anordnung"), ("F", "füllen ⇄ ganz"), ("V", "randlos"), ("1–9", "Fotos pro Seite"), ("⌘D", "Seite duplizieren"), ("⇧⌘C ⇧⌘V", "Layout kopieren, einsetzen")],
  prompt='<b>Du:</b> Mach ein Querformat-Buch mit 60 Seiten aus ~/Bilder/Island 2026. Die 5-Sterne-Fotos bekommen eigene Seiten.\n<b>Assistent:</b> Edition Hardcover angelegt, 60 Seiten, 142 Fotos. Auf Doppelseite 14 lagen zwei Horizontfotos übereinander, jetzt randlos nebeneinander. Die Prüfung ist sauber.',
  ed_eyebrow="Editionen", ed_h="<span class='hl'>Mehrere Bücher</span> aus denselben Fotos.",
  ed_lead="Ein ausführliches Hardcover quer für dich und ein kürzeres Softcover hochkant für die Familie teilen sich dieselben Fotos. Jede Edition hat ihr eigenes Format, ihre Seitenzahl und ihre Layouts. Beim Formatwechsel passen sich die Layouts an.",
  ed_caps=["<b>Hardcover quer.</b> 297 × 210 mm, die lange Fassung.", "<b>Softcover hochkant.</b> 210 × 297 mm, weniger Seiten, dieselben Fotos."],
  how_eyebrow="So geht's", how_h="Vom Ordner zur Druckerei in vier Schritten.",
  steps=[("Fotos holen", "Ordner reinziehen, Lightroom-Sammlung wählen oder den KI-Assistenten machen lassen."),
         ("Format wählen", "Druckprofil und Größe aussuchen. Beschnitt, Sicherheitsabstand und Klebezone kommen mit."),
         ("Gestalten", "Automatisch füllen macht einen ersten Entwurf. Danach änderst du Doppelseiten mit der Tastatur oder durch Ziehen."),
         ("Exportieren", "Inhalt und Umschlag als getrennte PDFs, RGB oder CMYK mit ICC-Profil, fertig zum Hochladen.")],
  pr_eyebrow="Druckereien", pr_h="Zehn Druckereien und 208 Formate eingebaut. <span class='hl'>Jede andere</span> über ihr Datenblatt.",
  pr_lead="Billerbook schreibt normale Druck-PDFs mit Endformat- und Beschnittrahmen, eingebettetem Ausgabeprofil und Bildern in voller Auflösung. Was sich zwischen Druckereien unterscheidet, steht im Druckprofil. Für eine Druckerei, die fehlt, importierst du ihre Umschlagvorlage oder trägst ihre Werte einmal ein und exportierst sie als Profil.",
  spec=[("Beschnitt", "3 mm"), ("Sicherheitsabstand", "5 mm"), ("Klebezone Hardcover", "7 mm"), ("Umschlag", "Rücken aus Seitenzahl"), ("Farbe", "RGB oder CMYK + ICC"), ("Profile", "WIRmachenDRUCK, frei")],
  spec_note="Die Werte oben stammen aus dem Profil für WIRmachenDRUCK, abgeglichen mit den Datenblättern der Druckerei und echten gedruckten Büchern. Im freien Profil stellst du jeden Wert für eine andere Druckerei ein.",
  shops_label="Eingebaute Druckprofile", shops_slug="druckereien", shops_more="Daten, Quellen und Formate jeder Druckerei →",
  shops_title="Druckereien und Formate in Billerbook: WIRmachenDRUCK, Saal Digital, CEWE, WhiteWall, Blurb, Amazon KDP, Lulu, Mixam und mehr",
  shops_desc="Beschnitt, Seitenregeln, Rückenbreite und Umschlagmaße, die Billerbook je Druckerei nutzt, mit Links zu den Datenblättern der Druckereien.",
  shops_h1="Druckereien", shops_intro="Billerbook schreibt normale Druck-PDFs, also kann jede Druckerei mit PDF-Upload dein Buch drucken. Diese Profile sind eingebaut. Jede Zahl stammt aus den veröffentlichten Angaben der Druckerei; die Links stehen unter jedem Profil. Nennt eine Druckerei das Umschlagmaß nur in ihrem eigenen Rechner, importierst du die Vorlage, die er erzeugt, und Billerbook übernimmt das genaue Maß.",
  status_names={"verified": "geprüft", "partial": "teilweise geprüft, Umschlag über Vorlage", "manual": "eigene Werte"},
  col=["Druckerei", "Region", "Inhalt", "Rücken"], interior_names={"single": "Einzelseiten", "spreads": "Doppelseiten"},
  spine_names={"formula": "Formel der Druckerei", "table": "Tabelle der Druckerei", "printer": "Rechner oder Vorlage der Druckerei"},
  lbl_bleed="Beschnitt", lbl_safety="Sicherheitsabstand", lbl_pages="Seiten", lbl_colour="Farbe", lbl_cover="Umschlag", lbl_formats="Formate", lbl_papers="Papiere", lbl_sources="Quellen", lbl_checked="Geprüft",
  lbl_wrap="Einschlag", lbl_joint="Zugabe je Rückenseite", lbl_hinge="Falz", lbl_blank="erste und letzte Seite leer", lbl_any="Deine Druckerei fehlt? Importiere ihre Umschlagvorlage oder trag ihre Werte einmal ein und exportiere sie als Profil. Schick das Profil mit Link zum Datenblatt, dann kommt es ins nächste Release.",
  faq_h="Fragen",
  faq=[("Ist das wirklich kostenlos?", "Ja. Billerbook ist Open Source unter der AGPL-3.0. Es gibt keine Bezahlversion, kein Konto und keine Testphase."),
       ("Funktioniert es mit WIRmachenDRUCK und Saal Digital?", "Ja. Das Profil für WIRmachenDRUCK ist mit den Datenblättern und gedruckten Büchern abgeglichen. Für Saal Digital exportiert Billerbook den Inhalt als Doppelseiten mit leerer erster und letzter Seite, wie Saal es verlangt. Das Umschlagmaß liest Billerbook aus Saals Vorlage."),
       ("Geht auch Blurb, Amazon KDP oder Lulu?", "Ja. Für KDP- und Lulu-Paperbacks nutzt Billerbook die veröffentlichten Rückenformeln, der Umschlag stimmt ohne Vorlage. Für Blurb und für Hardcover lädst du die Umschlagvorlage der Druckerei herunter und importierst sie."),
       ("Welche Formate gibt es?", "208 Formate in zwölf Profilen: Fotobücher von 15 × 15 bis 40 × 30 cm, Buchformate wie 12 × 19, 13,5 × 21,5, A5, 17 × 24 und B5, US-Formate wie 6 × 9 Zoll und Magazine in A4, A5, 23 × 30 cm und US Letter. Jede Druckerei und jede Bindung hat zusätzlich ein Sonderformat mit freier Breite und Höhe."),
       ("Kann ich ein Magazin oder eine Broschüre machen?", "Ja. Rückendrahtheftung ist eine eigene Bindung: Seiten in Viererschritten, Formate wie A4, A5, 23 × 30 cm und US Letter. Der Umschlag ist entweder Teil des Innenteils oder eine eigene PDF mit vier Seiten (U1 bis U4) für festeres Umschlagpapier."),
       ("Kann ChatGPT oder Claude das Buch für mich bauen?", "Ja. Claude Desktop, Codex und Cursor verbinden sich lokal. ChatGPT und claude.ai verbinden sich über OAuth: Billerbook öffnet einen Tunnel, du trägst die Adresse als Connector ein und gibst ihn mit einem sechsstelligen Code aus der App frei. Entfernte Assistenten arbeiten nur an deinen Fotobuch-Projekten und kommen an keine anderen Dateien auf deinem Mac. Gibst du ihnen das Datenblatt deiner Druckerei, richten sie das Buch danach ein."),
       ("Kann ich das Buch auf meine Website stellen?", "Ja, als interaktives HTML-Buch zum Blättern mit Pfeiltasten und Wischen, mit lesbarem Text für Suchmaschinen und einem Schnipsel für Astro oder jede andere Seite. Dazu gibt es EPUB, Instagram-Karussells, Seitenbilder und ein kleines Bildschirm-PDF."),
       ("Woher kennt Billerbook die Rückenbreite?", "Von der Druckerei: aus ihrer Formel oder Tabelle für Papier und Seitenzahl, wo sie eine veröffentlicht, sonst aus ihrer Umschlagvorlage oder aus dem Wert, den du einträgst. Bis dahin zeigt Billerbook eine Schätzung, kennzeichnet sie und warnt vor dem Export."),
       ("Gibt es eine Seitengrenze wie die 240 Seiten in Lightroom?", "Nein. Die Grenze gehört zu Blurb, auf dem das Buch-Modul von Lightroom aufbaut. Billerbook hat keine; es zählt nur, was deine Druckerei bindet, und die Druckprüfung kennt die Grenzen der Druckereien, die sie veröffentlichen."),
       ("Sehe ich in Lightroom, welche Fotos im Buch sind?", "Ja, mit dem Plug-in für Lightroom Classic. Es pflegt im Bedienfeld Sammlungen unter Billerbook eine Sammlung je Edition und eine zweite mit den Fotos deiner Lightroom-Auswahl, die in dieser Edition noch fehlen."),
       ("Läuft es unter Windows oder Linux?", "Zum Download gibt es eine Mac-App. Der Editor selbst ist eine lokale Web-App in Node.js und läuft aus dem Quellcode auch unter Windows und Linux. Die Anleitung steht im README."),
       ("Brauche ich Lightroom?", "Nein. Ein Ordner mit JPEGs reicht. Die Lightroom-Classic-Anbindung ist für alle, die ihre Fotos ohnehin dort auswählen."),
       ("Geht das mit Capture One oder Affinity?", "Ja. Auf dem Mac liest Billerbook Alben, Projekte und Gruppen aus dem Katalog oder der Session, die in Capture One offen ist; für den Druck verarbeitest du das Album in einen Ordner, Billerbook ordnet die Dateien über den Namen zu. Jedes Buch lässt sich außerdem als IDML exportieren. Affinity (kostenlos) und InDesign öffnen das als bearbeitbares Layout mit Bild- und Textrahmen, dort kannst du den Feinschliff machen."),
       ("Sehe ich das ganze Buch auf einen Blick?", "Ja. Der Tab Übersicht zeigt alle Doppelseiten, und die Seitenübersicht als PDF legt sie mit Seitenzahlen auf A4-Bögen, zum Freigeben vor der Bestellung."),
       ("Verlassen meine Fotos den Rechner?", "Nein. Alles läuft lokal. Online geht die App nur, um nach Updates zu sehen."),
       ("Wie kommen Updates?", "Die Mac-App prüft die GitHub-Releases und installiert neue Versionen, wenn du zustimmst.")],
  sc_slug="botanical-stories", sc_nav="Beispielbuch",
  sc_title="Botanical Stories: ein Bildband mit 170 Seiten aus 22 Gartenbesuchen, gemacht mit Billerbook",
  sc_desc="Gewächshäuser und botanische Gärten von Greifswald bis Teneriffa, als Bildband in Billerbook gestaltet: aus den Galerien auf tillheidrich.de importiert, Vorlage Botanik, druckfertig. Blättere durch das interaktive Buch.",
  sc_eyebrow="Gemacht mit Billerbook", sc_h1="Botanical <span class='hl'>Stories</span>",
  sc_lead="Gewächshäuser und Gärten von 2019 bis 2024: Greifswald, Amsterdam, Leiden, Kopenhagen, Aarhus, Utrecht, Hannover, Hamburg, Gran Canaria, Teneriffa. 118 Fotos, 22 Kapitel, 170 Seiten A4 quer.",
  sc_book_h="Durch das Buch blättern", sc_book_note="Pfeiltasten oder wischen. Das interaktive Buch ist Billerbooks HTML-Export, so eingebunden, wie er aus der App kommt.",
  sc_how_h="So ist es entstanden",
  sc_how=[("22 Webseiten rein, ein Buch raus", "Jeder Garten ist eine Galerie auf tillheidrich.de. Der Web-Import hat jede Galerieseite gelesen, je acht gleichmäßig verteilte Fotos genommen und aus dem Titel eine Kapitelseite und aus dem Text eine Textseite gemacht."),
          ("Eine Vorlage, dann ein Rhythmus", "Die Vorlage Botanik setzt warmes Papier, Cormorant Garamond und Tafeln im klassischen Satzspiegel. Jedes Kapitel beginnt auf einer rechten Seite mit einer randlosen Doppelseite und wechselt dann zwischen Tafeln, kleinen Fotos mit viel Weiß und Diptychen, so wie Fotografen ihre Bildbände takten."),
          ("Vor dem Druck geprüft", "Die Prüfung markiert jedes Foto, das für den Druck zu klein ist. Die Webgalerien enthalten Bildschirm-JPEGs, also nimmt die Druckausgabe die Originale aus Lightroom; Web und Social Media nutzen das, was du hier siehst."),
          ("Raus in jedem Format", "Aus demselben Projekt: Druck-PDFs mit Umschlag in PDF/X-4, das interaktive HTML-Buch auf dieser Seite, ein Instagram-Karussell, ein Bildschirm-PDF und die Doppelseiten, die auf dieser Website zu sehen sind.")],
  sc_spreads_h="Einige Doppelseiten", sc_galleries="Die Galerien auf tillheidrich.de",
  sc_cta="Mach dein eigenes Buch",
  final_h="Billerbook laden und einen Fotoordner öffnen.",
  foot_by='Gebaut von <a href="https://tillheidrich.de">Till Heidrich</a> in Tostedt.',
  imprint="Impressum", privacy="Datenschutz", source="Quellcode",
 ),
}

def esc(s): return html.escape(s, quote=True)

import json as _json
SHOPS = _json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'print-shops.json')))

def L(o, lang):
    return o.get(lang) or o.get('en') if isinstance(o, dict) else (o or '')

def shop_spine(b):
    if b.get('papers'):
        sp = b['papers'][0]['spine']
        return sp.get('type', 'printer') if isinstance(sp, dict) else sp
    return (b.get('spine') or {}).get('type', 'printer')

def shop_rows(t):
    rows = []
    for sh in SHOPS:
        bs = sh['bindings']
        inter = sorted({b['interior'] for b in bs.values()})
        spines = sorted({shop_spine(b) for b in bs.values()})
        rows.append(f"<tr><td><b>{esc(sh['name'])}</b><br><span class='muted'>{esc(sh['region'])}</span></td><td>{esc(', '.join(t['interior_names'][i] for i in inter))}<br><span class='muted'>{esc(' / '.join(t['spine_names'][x] for x in spines))}</span></td></tr>")
    return ''.join(rows)

def mm(v):
    return f"{v:g} mm"

BIND = {'en': {'hardcover': 'Hardcover', 'softcover': 'Softcover / paperback', 'layflat': 'Layflat', 'saddle': 'Saddle stitch (magazine)'}, 'de': {'hardcover': 'Hardcover', 'softcover': 'Softcover', 'layflat': 'Layflat', 'saddle': 'Rückendrahtheftung (Magazin)'}}

def app_ld(t, url):
    en = t['lang'] == 'en'
    data = [{
        "@context": "https://schema.org", "@type": "SoftwareApplication", "name": "Billerbook",
        "url": BASE, "downloadUrl": DL, "softwareVersion": VERSION, "operatingSystem": "macOS 12 or later",
        "applicationCategory": "DesignApplication", "applicationSubCategory": "Photo book layout",
        "description": t['desc'], "inLanguage": ["en", "de"], "license": "https://www.gnu.org/licenses/agpl-3.0.html",
        "isAccessibleForFree": True, "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"},
        "image": BASE + "assets/img/og.jpg", "screenshot": [BASE + "assets/img/app-editor-012.webp", BASE + "assets/img/app-printsettings.webp"],
        "author": {"@type": "Person", "name": "Till Heidrich", "url": "https://tillheidrich.de"},
        "codeRepository": REPO,
        "featureList": [c[1] for c in t['cards']],
    }, {
        "@context": "https://schema.org", "@type": "FAQPage", "inLanguage": t['lang'],
        "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in t['faq']],
    }]
    return data

def shops_ld(t, url):
    return [{
        "@context": "https://schema.org", "@type": "TechArticle", "headline": t['shops_title'], "inLanguage": t['lang'], "url": url,
        "about": [sh['name'] for sh in SHOPS], "author": {"@type": "Person", "name": "Till Heidrich"}, "dateModified": SHOPS[0].get('checked'),
    }]

GALLERIES = [
    ("Botanischer Garten der Uni Greifswald", "botanischer-garten-der-uni-greifswald"), ("Hortus Botanicus Amsterdam", "hortus-botanicus-amsterdam-august-2020"),
    ("Hortus botanicus Leiden", "botanischer-garten-universitaet-leiden"), ("Jardín de la Marquesa, Gran Canaria", "gran-canaria-jardin-de-la-marquesa-2021"),
    ("Botanisk Have, Kopenhagen", "botanisk-have-kopenhagen"), ("Jardín Botánico, Puerto de la Cruz", "botanischer-garten-auf-teneriffa-puerto-de-la-cruz"),
    ("Berggarten Hannover", "hannover-berggarten-17-juni-2023"), ("Tropenhaus Walsrode", "tropenhaus-im-vogelpark-walsrode"),
    ("Planten un Blomen, Hamburg", "tropenhaus-der-universitaet-hamburg-planten-un-blomen"), ("Botanischer Garten Utrecht", "botanischer-garten-der-universitaet-utrecht-oktober-2023"),
    ("Botanisk Have, Aarhus", "botanischer-garten-botanisk-have-in-aarhus"), ("Gärtnerei Bernstorff, Aarhus", "gaertnerei-bernstorff-den-gamle-by-aarhus"),
    ("Randers Regnskov", "randers-regnskov-tropical-zoo"),
]
SPREADS = [("bs-hero.webp", "Greifswald Botanic Garden, full-bleed opening spread", "Botanischer Garten Greifswald, randlose Auftaktdoppelseite"),
           ("bs-ferns.webp", "Two plates: greenhouse and ferns", "Zwei Tafeln: Gewächshaus und Farne"),
           ("bs-bw.webp", "Greifswald on film, black and white", "Greifswald auf Film, schwarzweiß"),
           ("bs-diptych.webp", "Diptych of palm leaves on film", "Diptychon mit Palmblättern auf Film"),
           ("bs-gate.webp", "Jardín Botánico, Puerto de la Cruz", "Jardín Botánico, Puerto de la Cruz"),
           ("bs-calathea.webp", "Calathea leaves and a palm house path", "Calathea-Blätter und ein Weg im Palmenhaus"),
           ("bs-bernstorff.webp", "Gärtnerei Bernstorff, Den Gamle By, Aarhus", "Gärtnerei Bernstorff, Den Gamle By, Aarhus")]

def showcase_ld(t, url):
    return [{
        "@context": "https://schema.org", "@type": "Book", "name": "Botanical Stories", "inLanguage": "en",
        "author": {"@type": "Person", "name": "Till Heidrich", "url": "https://tillheidrich.de"},
        "numberOfPages": 170, "bookFormat": "https://schema.org/Hardcover", "image": BASE + "assets/img/bs-cover.webp",
        "description": t['sc_lead'], "url": url,
        "creativeWorkStatus": "Example made with Billerbook",
        "isBasedOn": [f"https://www.tillheidrich.de/gallery/{g}/" for _, g in GALLERIES],
    }, {
        "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Billerbook", "item": BASE + t['path']},
            {"@type": "ListItem", "position": 2, "name": "Botanical Stories", "item": url}]
    }]

def legal_pages(mail):
    m = f'<a href="mailto:{mail}">{mail}</a>' if mail else 'siehe <a href="https://tillheidrich.de/impressum/">Impressum auf tillheidrich.de</a>'
    return {
 "impressum": ("Impressum", f'''<p><strong>Angaben gemäß § 5 DDG</strong></p>
<p>Till Heidrich – Heidrich Digital<br>Rotdornweg 17<br>21255 Tostedt<br>Deutschland</p>
<h2>Kontakt</h2><p>E-Mail: {m}<br>Web: <a href="https://heidrich-digital.de">heidrich-digital.de</a></p>
<h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2><p>Till Heidrich, Anschrift wie oben</p>
<h2>Umsatzsteuer</h2><p>Kleinunternehmer gemäß § 19 UStG, daher keine Umsatzsteuer-Identifikationsnummer.</p>
<h2>Software</h2><p>Billerbook ist freie Software unter der GNU Affero General Public License 3.0 und wird, soweit gesetzlich zulässig, ohne Gewährleistung bereitgestellt. Der Quellcode liegt auf <a href="{REPO}">GitHub</a>.</p>
<h2>Haftung für Links</h2><p>Diese Seite verlinkt auf externe Seiten (GitHub). Für deren Inhalte sind die jeweiligen Anbieter verantwortlich.</p>'''),
 "datenschutz": ("Datenschutz", f'''<p>Diese Website setzt keine Cookies, nutzt keine Analyse- oder Tracking-Dienste und bindet keine Inhalte von Drittanbietern ein. Schriften und Bilder liegen auf demselben Server.</p>
<h2>Verantwortlicher</h2><p>Till Heidrich – Heidrich Digital, Rotdornweg 17, 21255 Tostedt, {m}</p>
<h2>Hosting und Server-Logfiles</h2><p>Die Seite liegt auf einem Server der Hetzner Online GmbH in Deutschland. Beim Aufruf verarbeitet der Webserver technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene Datei, Browserkennung), um die Seite auszuliefern und gegen Missbrauch zu schützen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Die Logs werden nach kurzer Zeit gelöscht. Mit Hetzner besteht ein Vertrag zur Auftragsverarbeitung.</p>
<h2>Downloads über GitHub</h2><p>Der Download-Knopf führt zu GitHub (GitHub, Inc., USA). Dort gelten die Datenschutzbestimmungen von GitHub. Erst mit dem Klick werden Daten an GitHub übertragen.</p>
<h2>Die App</h2><p>Billerbook läuft lokal auf deinem Rechner. Fotos, Kataloge und Projekte werden nicht hochgeladen. Die Mac-App fragt bei GitHub nach neuen Versionen; dabei sieht GitHub deine IP-Adresse.</p>
<h2>Deine Rechte</h2><p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch und Datenübertragbarkeit sowie das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, etwa bei der Landesbeauftragten für den Datenschutz Niedersachsen.</p>'''),
    }

EN_NOTE = '<p class="muted">This page is in German because German law requires it.</p>'

def llms_txt():
    t = T["en"]
    lines = ["# Billerbook", "", "> " + t["desc"], "",
             "Billerbook is a free, open-source (AGPL-3.0) photo book layout app for macOS by Till Heidrich (Tostedt, Germany). Version " + VERSION + ".", "",
             "## Facts",
             "- Runs locally on the Mac; photos are not uploaded. Also runs from source on Windows and Linux (Node.js 22.13+).",
             "- Input: any folder of JPEG/TIFF/PNG/WebP, or Lightroom Classic collections (catalog read-only). Books from Lightroom's Book module can be imported.",
             "- Several editions of one book from the same photo pool, each with its own print shop, format and page count.",
             "- Output: print PDFs with TrimBox/BleedBox, interior as single pages or spreads, cover as one sheet with spine. CMYK with ICC output intent or sRGB.",
             "- Spine width from the printer's formula or table per paper and page count, from the printer's cover template PDF, or entered manually.",
             "- Lightroom Classic plug-in keeps a collection per edition and one with missing photos.",
             "- 208 formats in 12 print profiles (Blurb, Amazon KDP, Lulu, IngramSpark, Mixam, Saal Digital, CEWE PDF to Book, WhiteWall, PrestoPhoto, WIRmachenDRUCK, standard sizes, custom), plus a special size with free width and height for every binding.",
             "- Magazines and booklets: saddle stitching, pages in steps of four, cover inside the interior or as a separate four-page PDF (U1-U4).",
             "- Reads a print shop's data sheet PDF (trim and data size, bleed, safety margin, spine, wrap, page rules, colour, ICC) and sets the edition up from it (MCP tools read_print_spec and apply_print_spec).",
             "- Seven book templates (monograph, year book, gallery, botanical, travel journal, wedding, Christmas year review), nine bundled open-licence typefaces and your own fonts, text printed as outlines, black and white and toning, background graphics, ISBN barcodes, soft proof against the printer's CMYK profile.",
             "- Other outputs: proof PDF, screen PDF, interactive HTML book for websites, EPUB 3 fixed layout, CBZ, Instagram carousel, page images, file list for Finder and Lightroom, .billerbook project file. Imports PDFs, web pages and HTML.",
             "- Capture One albums as photo source (Mac); IDML export for Affinity and InDesign; page overview PDF.",
             "- MCP server with 51 tools for Claude Desktop, Codex, Cursor (local) and ChatGPT or claude.ai (remote, OAuth 2.1 with PKCE and a pairing code; remote clients get no file-path tools).",
             "- Example: Botanical Stories, a 170-page monograph made from 22 web galleries: " + BASE + "botanical-stories/",
             "", "## Built-in print profiles"]
    for sh in SHOPS:
        st = ", ".join(f"{k}: {b['status']}" for k, b in sh["bindings"].items())
        lines.append(f"- {sh['name']} ({sh['region']}): {st}. Sources: " + " ".join(sh["sources"]))
    lines += ["", "## Links", f"- Download: {DL}", f"- Source code: {REPO}", f"- Print shop details: {BASE}print-shops/", f"- MCP documentation: {REPO}/blob/main/docs/mcp.md", f"- Print profile format: {REPO}/blob/main/docs/print-profiles.md", ""]
    for q, a in t["faq"]:
        lines += [f"### {q}", a, ""]
    return "\n".join(lines)


# ---------- Copy for the Benchkey layout (home, how it works, AI) ----------
K = {
 "en": dict(
  nav=[("how", "How it works"), ("ai", "AI"), ("shops", "Print shops"), ("sc", "Example book")],
  slug_how="how-it-works", slug_ai="ai",
  h1="Lay it out on your Mac. <em>Print it anywhere.</em>",
  lede="Billerbook is a free photo book editor for the Mac. Drop in a folder, a Lightroom collection or a Capture One album, flip through layouts with the space bar, and export the PDF your print shop asks for: bleed, spine and cover included. <b>No account, and your photos stay on your Mac.</b>",
  who="For photographers, families with a yearly album, clubs with a magazine, and anyone who has fixed a print PDF in InDesign once too often.",
  cta2="How a book comes together",
  sheet_top="Botanical Stories", sheet_sub="Hardcover · A4 landscape", sheet_tag="Spread 2–3",
  sheet_cap=("Trim 297 × 210 mm", "PDF page 303 × 216 mm"),
  sheet_h="Ready for the print shop",
  sheet_rows=[("Bleed", "3 mm on every outer edge", "ok", "OK"), ("Cover", "645 × 245 mm, spine 11 mm for 170 pages", "ok", "Sized"),
              ("Colour", "CMYK, checked in soft proof", "ok", "OK"), ("Glue zone", "No text within 7 mm of the gutter", "", "Checked")],
  sheet_keys="Space next layout · F fill or fit · V full bleed",
  toast1="Spread 14: two horizons are now a full-bleed pair", toast2="Preflight clean · 170 pages",
  specs_lead="Writes the files a print shop asks for.",
  specs=[("Interior PDF", "Trim and bleed boxes, ICC output intent"), ("Cover PDF", "Back, spine and front on one sheet"), ("Proof PDF", "Guides and numbered checks"), ("IDML", "Editable in Affinity and InDesign"), ("HTML book", "Plus EPUB for e-readers")],
  state='<span class="hl">The PDF your print shop wants</span> comes out of the same app you lay the book out in. No repair round in InDesign, <span class="hl">and no guessing the spine.</span>',
  board_h="Ten print shops, 208 formats.", board_h2="Or any other, from its data sheet.",
  board_p="Each print profile holds what differs between shops: bleed, page rules, spine and cover. The table shows what Billerbook uses today.",
  board_bar="Print profiles", board_q="Search print shops",
  board_cols=["Print shop", "Bindings", "Spine from", "Status"],
  thread_h="Setting up a print shop that is not listed",
  thread_p="Give your assistant the print shop's data sheet. It reads the numbers and sets up the book.",
  thread=[("me", "Here is the data sheet from WIRmachenDRUCK. Set up the hardcover like it says.", "You"),
          ("them", "Trim 210 × 297 mm, data size 216 × 303, bleed 3 mm, safety margin 5 mm, glue zone 7 mm. The cover wrap is 15 mm, worked out from their cover formula.", "Claude, via Billerbook"),
          ("sys", "Edition set up from the data sheet and saved as a print profile for this shop.", ""),
          ("me", "And the spine?", "You"),
          ("them", "The sheet has no spine table. I used their order form value, please check it there before you upload.", "Claude")],
  field_h="Photos from where they already are.", field_h2="One book.",
  tabs=[("lr", "Lightroom Classic"), ("c1", "Capture One"), ("folder", "Any folder"), ("web", "A web page")],
  panels={
   "lr": ("Lightroom · Greenhouses", [("Read", "Catalog opened read-only", "ok", "OK"), ("118", "Photos from two collections", "", "Pool"), ("Exports", "Full-size files matched by name", "ok", "118/118"), ("Book", "Book module book taken over, 24 pages", "", "Import")],
          "Plug-in for Lightroom", "Shows which photos are in the book", "A collection per edition, one with the photos still missing, and one menu item that exports the print files."),
   "c1": ("Capture One · Album Botanik", [("Album", "Read through AppleScript", "ok", "OK"), ("64", "Variants in the album", "", "Pool"), ("JPEG", "Processed files matched by name", "ok", "Matched"), ("RAW", "Waits until it is processed", "no", "Later")],
          "Mac only", "Capture One must be open", "Billerbook only reads. Edits stay in Capture One."),
   "folder": ("~/Pictures/Iceland 2026", [("142", "JPEG, TIFF, PNG, WebP or HEIC", "", "Pool"), ("Date", "Capture time from EXIF", "ok", "Sorted"), ("Stars", "Ratings from XMP", "ok", "Read"), ("Text", "Captions from IPTC", "ok", "Read")],
          "No upload", "Nothing leaves the Mac", "Originals are never changed. Tones and crops live in the project."),
   "web": ("tillheidrich.de · 22 galleries", [("22", "Gallery pages read", "ok", "OK"), ("8", "Photos per garden, evenly spread", "", "Picked"), ("H1", "Titles became chapter pages", "ok", "Chapters"), ("Text", "Paragraphs became text pages", "", "Pages")],
          "How the example book was made", "A website in, a book out", "Botanical Stories came from 22 galleries in one import."),
  },
  notes=[("Several editions.", "A big landscape hardcover and a short portrait softcover from the same photos."), ("Smart crops.", "Billerbook finds the subject of each photo and crops around it."), ("Captions.", "From the photo's metadata, editable on the page."), ("Your fonts.", "Nine open-licence typefaces built in, your own TTF or OTF on top.")],
  steps_h="From folder to print shop", steps_h2="in an afternoon.",
  steps_cta="Download Billerbook",
  steps=[("Add photos.", "A folder, a Lightroom collection, a Capture One album or a web page."), ("Pick the print shop.", "Format, paper and binding; the spine follows from the page count."),
         ("Lay it out.", "Auto layout or a template, then the space bar for alternatives."), ("Check it.", "Preflight, soft proof and the whole book on one sheet."), ("Export and upload.", "Interior and cover as the shop wants them.")],
  exp_seg=["Print", "Check", "Share", "Edit elsewhere"],
  exp_fields=[("Edition", "Hardcover · 170 pages"), ("Print shop", "WIRmachenDRUCK · A4 landscape")],
  exp_label="Files", exp_chk=[("Interior PDF", True), ("Cover PDF", True), ("Proof PDF", True), ("Page overview", True), ("IDML for Affinity", False), ("HTML book", False)],
  exp_pages=("Pages", "All, or e.g. 1–12, 40"), exp_foot=("4 files to ~/Desktop", "Export"),
  keys_h="Layout at the speed of a key.", keys_h2="The slow parts are one keystroke here.",
  keys=[("Space", "Next arrangement of the photos on the page"), ("F", "Fill the frame or show the whole photo"), ("V", "Turn the photo into a full-bleed page"), ("1–9", "A layout with that many photos"), ("⌘D", "Duplicate the page"), ("⇧⌘C ⇧⌘V", "Copy a layout, paste it on other pages")],
  show_h="See the whole book.", show_h2="Then print it.",
  show_p="The overview shows every spread at once, so repeated layouts and a lopsided rhythm stand out before you order. The same sheet goes out as a PDF for sign-off, and your assistant sees it too.",
  show_cta="Page through Botanical Stories", show_cap="Botanical Stories, spreads 1 to 47 in the page overview",
  off_h="No account, no upload.", off_h2="Your photos stay on your Mac.",
  off_p="Billerbook runs on your Mac. It reads photos where they are and writes the PDFs next to them. An AI assistant in the cloud connects only after you type a six-digit code from the app, and it gets no file paths.",
  off_svg=dict(photos="Your photos", photos2="Folder, Lightroom, Capture One", app="Billerbook", app2="on your Mac", pdf="Print PDFs", pdf2="Interior and cover", shop="Print shop", shop2="You upload", ai="AI assistant", ai2="Six-digit code, no file paths"),
  story_h="Why it exists",
  log_h="Release notes", log_sub="What changed lately. Every version is on GitHub with its download.",
  log=[("0.13.0", "Fifteen book styles, four of them in the manner of well-known photo books, crop ratios like in Lightroom, portrait photos at full page height.", "2026-11-26"),
       ("0.12.0", "Lightroom plug-in exports the print files itself, previews straight from RAW files, layout in the order of your Lightroom collection, drag photos onto any spread.", "2026-11-26"),
       ("0.11.1", "Fixes from an independent security review of the new import and export paths.", "2026-11-22"),
       ("0.11.0", "208 formats, magazines, data-sheet setup, templates and fonts, IDML for Affinity and InDesign, Capture One, page overview, ChatGPT and claude.ai over OAuth.", "2026-11-22"),
       ("0.10.0", "Print shops worldwide, spreads export, cover templates, the Lightroom plug-in and the Book module's page tools.", "2026-11-21")],
  faq_h="Questions",
  end_h="Pick the photos.", end_u="Print the book.",
  foot_about="A free photo book editor for the Mac, made by Till Heidrich in Tostedt, Germany. Open source under the AGPL-3.0.",
  foot_cols=[("Product", [("how", "How it works"), ("ai", "AI assistants"), ("shops", "Print shops"), ("sc", "Example book")]),
             ("Resources", [("gh", "Source code"), ("rel", "All releases"), ("mcp", "MCP documentation"), ("llms", "llms.txt")]),
             ("Legal", [("imp", "Imprint"), ("priv", "Privacy"), ("other", "Deutsch")])],
  foot_base="Billerbook is not affiliated with the print shops named on this site.",
  menu="Menu",
  # how it works
  how_title="How Billerbook works: from photos to print-ready PDFs",
  how_desc="Photos in from folders, Lightroom Classic or Capture One, layouts and templates, editions, keyboard, cover and spine, preflight, soft proof and every export Billerbook writes.",
  how_h1="How a book comes together.", how_lead="From a folder of photos to the files your print shop asks for, in the order you work.",
  how_blocks=[
   ("Photos in", "From where they are.", "Billerbook reads photos where you keep them and never changes the originals.",
    [("Any folder", "JPEG, TIFF, PNG, WebP, HEIC; date, stars and captions from the metadata."), ("Lightroom Classic", "Collections as the pool, in their Lightroom order, also a custom one. The plug-in exports full-size print files with your edits and later only what you changed. Books from the Book module come over with their pages."), ("Capture One", "Albums, projects and groups of the open catalog or session; processed files are matched by name."), ("Web pages and PDFs", "A gallery page or an HTML file becomes chapters and plates; a PDF becomes pages.")]),
   ("Layouts and templates", "Start from a style.", "Seven templates set fonts, colours, cover and page sequence: Monograph, Year book, Gallery, Botanical, Travel journal, Wedding and Christmas year review. After that, every page is yours.",
    [("Photo book layouts", "Plates on the Van de Graaf canon, chapter pages, text pages, diptychs and full-bleed spreads."), ("Free frames", "Move and size frames in millimetres, with snapping to thirds and the canon block."), ("Your layouts", "Save a page as a layout and use it on any page with the same number of photos."), ("Tones and graphics", "Black and white, four tones, paper textures and background graphics.")]),
   ("Editions", "Several books from one set of photos.", "A detailed landscape hardcover for you and a shorter portrait softcover for the family share the same photos. Each edition has its own print shop, format and page count, and layouts adapt when the format changes.", None),
   ("Cover and spine", "Sized by the page count.", "The cover follows from page count and paper: spine width from the printer's formula or table, turn-in and hinge from the profile, or exactly from the cover template PDF you download from the shop. ISBN barcodes are drawn as vectors.", None),
   ("Check before you order", "Three ways to look.", "Preflight lists what a print shop would reject. Soft proof shows the colours after the printer's CMYK conversion and marks what shifts. The page overview puts every spread on one sheet.",
    [("Preflight", "Low resolution, text in the glue zone, page limits, text that does not fit, small text, barcode rules."), ("Soft proof", "The printer's ICC profile applied on screen, with a gamut warning."), ("Proof PDF", "Trim, safe area and glue zone drawn in, every message numbered on page 1."), ("Page overview", "Every spread on A4 sheets with page numbers, cover first.")]),
  ],
  exports_h="Every file Billerbook writes", exports_cols=["Export", "What you get"],
  exports=[("Interior PDF", "Single pages or spreads, trim and bleed boxes, CMYK with ICC output intent or sRGB, text as outlines"), ("Cover PDF", "Back, spine and front on one sheet; magazines as a four-page cover"), ("Proof PDF", "Guides and numbered preflight messages"), ("Page overview PDF", "All spreads on A4 landscape sheets with page numbers"),
           ("IDML", "Editable layout for Affinity (free) and InDesign, photos in a Links folder"), ("Screen PDF", "Small RGB file of the double pages"), ("HTML book", "Interactive book for your website, one page at a time on phones"), ("EPUB", "Fixed layout for e-readers"),
           ("Images", "Pages or spreads as JPEG or PNG; Instagram carousel at 1080 × 1350"), ("File list", "CSV and TXT of every photo with page, path and Lightroom id"), ("Originals", "All photos of an edition copied into one folder, named by page"), (".billerbook", "The whole project with its photos, to move or archive")],
  idml_h="Finish in Affinity or InDesign", idml_p="Some books need a last pass in a full layout program. The IDML export opens in Affinity (free, by Canva) and in InDesign with real image and text frames, the same crops and the photos in a Links folder. Background graphics, page numbers and the barcode stay in the print PDF.",
  # AI
  ai_title="Billerbook and AI assistants: Claude, ChatGPT, Codex and Cursor lay out photo books over MCP",
  ai_desc="Billerbook's MCP server has 51 tools. Connect Claude Desktop, Codex or Cursor locally, or ChatGPT and claude.ai with a pairing code. The assistant reads print shop data sheets, lays out the book and checks every spread.",
  ai_h1="Ask your assistant to build the book.", ai_lead="Billerbook includes an MCP server with 51 tools. The assistant works on the same project you see in the app, and the app updates while it works.",
  ai_can_h="What it can do", ai_can_h2="And what you check.",
  ai_can=[("Set up the print", "Read a print shop's data sheet, apply it to the edition and save it as a profile; import a cover template."), ("Lay out", "Fill pages, apply a template, place and crop photos, write captions, set the cover."),
          ("Look at its own work", "See each spread as an image and the whole book as a contact sheet, then fix what looks wrong."), ("Check and export", "Run preflight and soft proof, export print PDFs, the proof, IDML or an HTML book.")],
  ai_local_h="On your Mac", ai_local_p="Claude Desktop, Claude Code, Codex, Cursor and LM Studio start Billerbook's MCP server themselves. Connect AI in the app writes the entry into Claude Desktop with one click; this is what it adds:",
  ai_remote_h="ChatGPT and claude.ai", ai_remote_p="Assistants in the cloud need a public address that leads to your Mac. Connect AI starts a tunnel, you add the address as a connector, and you confirm with a six-digit code from the app. The code works once and for ten minutes.",
  ai_remote_list=[("No file paths", "A remote assistant gets no tools that take paths on your Mac: no folders, catalogs, fonts or export folders."), ("Signed in with OAuth 2.1", "PKCE, tokens stored as hashes, refresh tokens rotate on every use."), ("Disconnect", "One click in the app removes a client and its tokens.")],
  ai_prompts_h="Things to ask",
  ai_prompts=["Here is the data sheet from my print shop. Set up the hardcover exactly like that and tell me which values you took from where.",
              "Make a photo book from ~/Pictures/Summer 2026. Landscape hardcover A4, five-star photos get their own page. Look at every spread and fix anything that looks unbalanced.",
              "In my project Year 2026, make a portrait softcover for the family with only the four- and five-star photos, at most 60 pages.",
              "Look at the whole book. Which layouts repeat too often, and where does a chapter not start on a right page?",
              "Turn Year 2026 into a Christmas year review, check it in soft proof and export the print PDFs."],
  ai_docs="Full tool list and setup in the MCP documentation",
 ),
 "de": dict(
  nav=[("how", "So funktioniert's"), ("ai", "KI"), ("shops", "Druckereien"), ("sc", "Beispielbuch")],
  slug_how="so-funktionierts", slug_ai="ki",
  h1="Am Mac gestalten. <em>Überall drucken.</em>",
  lede="Billerbook ist ein kostenloser Fotobuch-Editor für den Mac. Ordner, Lightroom-Sammlung oder Capture-One-Album reinziehen, mit der Leertaste durch Layouts blättern und das PDF exportieren, das deine Druckerei verlangt: mit Beschnitt, Buchrücken und Umschlag. <b>Ohne Konto, und deine Fotos bleiben auf dem Mac.</b>",
  who="Für Fotografinnen und Fotografen, Familien mit Jahresbuch, Vereine mit Heft und alle, die schon einmal ein Druck-PDF in InDesign repariert haben.",
  cta2="So entsteht ein Buch",
  sheet_top="Botanical Stories", sheet_sub="Hardcover · A4 quer", sheet_tag="Doppelseite 2–3",
  sheet_cap=("Endformat 297 × 210 mm", "PDF-Seite 303 × 216 mm"),
  sheet_h="Bereit für die Druckerei",
  sheet_rows=[("Beschnitt", "3 mm an jedem Außenrand", "ok", "OK"), ("Umschlag", "645 × 245 mm, Rücken 11 mm bei 170 Seiten", "ok", "Berechnet"),
              ("Farbe", "CMYK, im Softproof geprüft", "ok", "OK"), ("Klebezone", "Kein Text in 7 mm am Bund", "", "Geprüft")],
  sheet_keys="Leertaste nächstes Layout · F füllen oder ganz · V randlos",
  toast1="Doppelseite 14: zwei Horizonte jetzt randlos nebeneinander", toast2="Prüfung sauber · 170 Seiten",
  specs_lead="Schreibt die Dateien, die eine Druckerei verlangt.",
  specs=[("Inhalt-PDF", "Endformat- und Beschnittrahmen, ICC-Profil"), ("Umschlag-PDF", "Rücken, Buchrücken und Vorderseite auf einem Bogen"), ("Prüf-PDF", "Hilfslinien und nummerierte Hinweise"), ("IDML", "Bearbeitbar in Affinity und InDesign"), ("HTML-Buch", "Dazu EPUB für E-Reader")],
  state='<span class="hl">Das PDF, das deine Druckerei will,</span> kommt aus demselben Programm, in dem du das Buch gestaltest. Keine Reparaturrunde in InDesign <span class="hl">und kein Raten beim Buchrücken.</span>',
  board_h="Zehn Druckereien, 208 Formate.", board_h2="Oder jede andere, über ihr Datenblatt.",
  board_p="Im Druckprofil steht, was sich zwischen Druckereien unterscheidet: Beschnitt, Seitenregeln, Rücken und Umschlag. Die Tabelle zeigt, womit Billerbook heute arbeitet.",
  board_bar="Druckprofile", board_q="Druckerei suchen",
  board_cols=["Druckerei", "Bindungen", "Rücken aus", "Stand"],
  thread_h="Eine Druckerei einrichten, die fehlt",
  thread_p="Gib deinem Assistenten das Datenblatt der Druckerei. Er liest die Werte und richtet das Buch ein.",
  thread=[("me", "Hier ist das Datenblatt von WIRmachenDRUCK. Richte das Hardcover so ein, wie es da steht.", "Du"),
          ("them", "Endformat 210 × 297 mm, Datenformat 216 × 303, Beschnitt 3 mm, Sicherheitsabstand 5 mm, Klebezone 7 mm. Der Einschlag ist 15 mm, aus ihrer Umschlagformel berechnet.", "Claude, über Billerbook"),
          ("sys", "Edition nach dem Datenblatt eingerichtet und als Druckprofil für diese Druckerei gespeichert.", ""),
          ("me", "Und der Rücken?", "Du"),
          ("them", "Im Datenblatt steht keine Rückentabelle. Ich habe den Wert aus ihrem Bestellformular genommen, prüf ihn dort bitte vor dem Hochladen.", "Claude")],
  field_h="Fotos von dort, wo sie schon liegen.", field_h2="Ein Buch.",
  tabs=[("lr", "Lightroom Classic"), ("c1", "Capture One"), ("folder", "Ein Ordner"), ("web", "Eine Webseite")],
  panels={
   "lr": ("Lightroom · Gewächshäuser", [("Lesen", "Katalog nur lesend geöffnet", "ok", "OK"), ("118", "Fotos aus zwei Sammlungen", "", "Bestand"), ("Exporte", "Dateien in voller Größe über den Namen zugeordnet", "ok", "118/118"), ("Buch", "Buch aus dem Buch-Modul übernommen, 24 Seiten", "", "Import")],
          "Plug-in für Lightroom", "Zeigt, welche Fotos im Buch sind", "Eine Sammlung je Edition, eine mit den Fotos, die noch fehlen, und ein Menübefehl, der die Druckdateien exportiert."),
   "c1": ("Capture One · Album Botanik", [("Album", "Über AppleScript gelesen", "ok", "OK"), ("64", "Varianten im Album", "", "Bestand"), ("JPEG", "Verarbeitete Dateien über den Namen zugeordnet", "ok", "Zugeordnet"), ("RAW", "Wartet, bis es verarbeitet ist", "no", "Später")],
          "Nur am Mac", "Capture One muss offen sein", "Billerbook liest nur. Die Bearbeitung bleibt in Capture One."),
   "folder": ("~/Bilder/Island 2026", [("142", "JPEG, TIFF, PNG, WebP oder HEIC", "", "Bestand"), ("Datum", "Aufnahmezeit aus EXIF", "ok", "Sortiert"), ("Sterne", "Bewertungen aus XMP", "ok", "Gelesen"), ("Text", "Bildunterschriften aus IPTC", "ok", "Gelesen")],
          "Kein Upload", "Nichts verlässt den Mac", "Originale bleiben unverändert. Tönungen und Ausschnitte stehen im Projekt."),
   "web": ("tillheidrich.de · 22 Galerien", [("22", "Galerieseiten gelesen", "ok", "OK"), ("8", "Fotos je Garten, gleichmäßig verteilt", "", "Gewählt"), ("H1", "Titel wurden Kapitelseiten", "ok", "Kapitel"), ("Text", "Absätze wurden Textseiten", "", "Seiten")],
          "So entstand das Beispielbuch", "Eine Website rein, ein Buch raus", "Botanical Stories kam in einem Import aus 22 Galerien."),
  },
  notes=[("Mehrere Editionen.", "Ein großes Hardcover quer und ein kurzes Softcover hochkant aus denselben Fotos."), ("Kluge Ausschnitte.", "Billerbook findet das Motiv jedes Fotos und schneidet darum herum zu."), ("Bildunterschriften.", "Aus den Metadaten der Fotos, auf der Seite änderbar."), ("Deine Schriften.", "Neun freie Schriften eingebaut, eigene TTF oder OTF dazu.")],
  steps_h="Vom Ordner zur Druckerei", steps_h2="an einem Nachmittag.",
  steps_cta="Billerbook laden",
  steps=[("Fotos holen.", "Ein Ordner, eine Lightroom-Sammlung, ein Capture-One-Album oder eine Webseite."), ("Druckerei wählen.", "Format, Papier und Bindung; der Rücken folgt aus der Seitenzahl."),
         ("Gestalten.", "Automatisch oder mit einer Vorlage, dann die Leertaste für Alternativen."), ("Prüfen.", "Preflight, Softproof und das ganze Buch auf einem Bogen."), ("Exportieren und hochladen.", "Inhalt und Umschlag so, wie die Druckerei sie will.")],
  exp_seg=["Druck", "Prüfen", "Teilen", "Weiterbearbeiten"],
  exp_fields=[("Edition", "Hardcover · 170 Seiten"), ("Druckerei", "WIRmachenDRUCK · A4 quer")],
  exp_label="Dateien", exp_chk=[("Inhalt-PDF", True), ("Umschlag-PDF", True), ("Prüf-PDF", True), ("Seitenübersicht", True), ("IDML für Affinity", False), ("HTML-Buch", False)],
  exp_pages=("Seiten", "Alle, oder z. B. 1–12, 40"), exp_foot=("4 Dateien auf den Schreibtisch", "Exportieren"),
  keys_h="Gestalten im Tastentakt.", keys_h2="Was sonst zäh ist, ist hier ein Tastendruck.",
  keys=[("Leertaste", "Nächste Anordnung der Fotos auf der Seite"), ("F", "Rahmen füllen oder ganzes Foto zeigen"), ("V", "Das Foto als randlose Seite"), ("1–9", "Ein Layout mit so vielen Fotos"), ("⌘D", "Seite duplizieren"), ("⇧⌘C ⇧⌘V", "Layout kopieren und auf andere Seiten setzen")],
  show_h="Das ganze Buch auf einen Blick.", show_h2="Dann drucken.",
  show_p="Die Übersicht zeigt alle Doppelseiten auf einmal. Wiederholte Layouts und ein holpriger Rhythmus fallen auf, bevor du bestellst. Derselbe Bogen geht als PDF zur Freigabe raus, und dein Assistent sieht ihn auch.",
  show_cta="Durch Botanical Stories blättern", show_cap="Botanical Stories, Doppelseiten 1 bis 47 in der Seitenübersicht",
  off_h="Kein Konto, kein Upload.", off_h2="Deine Fotos bleiben auf dem Mac.",
  off_p="Billerbook läuft auf deinem Mac. Es liest die Fotos dort, wo sie liegen, und schreibt die PDFs daneben. Ein KI-Assistent in der Cloud verbindet sich erst, wenn du einen sechsstelligen Code aus der App eintippst, und bekommt keine Dateipfade.",
  off_svg=dict(photos="Deine Fotos", photos2="Ordner, Lightroom, Capture One", app="Billerbook", app2="auf deinem Mac", pdf="Druck-PDFs", pdf2="Inhalt und Umschlag", shop="Druckerei", shop2="Du lädst hoch", ai="KI-Assistent", ai2="Sechsstelliger Code, keine Pfade"),
  story_h="Warum es das gibt",
  log_h="Was neu ist", log_sub="Die letzten Versionen. Jede steht mit Download auf GitHub.",
  log=[("0.13.0", "Fünfzehn Buchstile, vier davon im Stil bekannter Fotobücher, Zuschnitt mit Seitenverhältnis wie in Lightroom, Hochformate in voller Seitenhöhe.", "2026-11-26"),
       ("0.12.0", "Das Lightroom-Plug-in exportiert die Druckdateien selbst, Vorschauen direkt aus RAW-Dateien, Gestaltung in der Reihenfolge deiner Lightroom-Sammlung, Fotos auf jede Doppelseite ziehen.", "2026-11-26"),
       ("0.11.1", "Korrekturen aus einer unabhängigen Sicherheitsprüfung der neuen Import- und Exportwege.", "2026-11-22"),
       ("0.11.0", "208 Formate, Magazine, Einrichtung per Datenblatt, Vorlagen und Schriften, IDML für Affinity und InDesign, Capture One, Seitenübersicht, ChatGPT und claude.ai über OAuth.", "2026-11-22"),
       ("0.10.0", "Druckereien weltweit, Export als Doppelseiten, Umschlagvorlagen, das Lightroom-Plug-in und die Seitenwerkzeuge des Buch-Moduls.", "2026-11-21")],
  faq_h="Fragen",
  end_h="Fotos aussuchen.", end_u="Buch drucken.",
  foot_about="Ein kostenloser Fotobuch-Editor für den Mac, gebaut von Till Heidrich in Tostedt. Open Source unter der AGPL-3.0.",
  foot_cols=[("Produkt", [("how", "So funktioniert's"), ("ai", "KI-Assistenten"), ("shops", "Druckereien"), ("sc", "Beispielbuch")]),
             ("Mehr", [("gh", "Quellcode"), ("rel", "Alle Versionen"), ("mcp", "MCP-Dokumentation"), ("llms", "llms.txt")]),
             ("Rechtliches", [("imp", "Impressum"), ("priv", "Datenschutz"), ("other", "English")])],
  foot_base="Billerbook gehört zu keiner der genannten Druckereien.",
  menu="Menü",
  how_title="So funktioniert Billerbook: von den Fotos zum druckfertigen PDF",
  how_desc="Fotos aus Ordnern, Lightroom Classic oder Capture One, Layouts und Vorlagen, Editionen, Tastatur, Umschlag und Rücken, Prüfung, Softproof und jeder Export, den Billerbook schreibt.",
  how_h1="So entsteht ein Buch.", how_lead="Vom Fotoordner bis zu den Dateien, die deine Druckerei verlangt, in der Reihenfolge, in der du arbeitest.",
  how_blocks=[
   ("Fotos rein", "Von dort, wo sie liegen.", "Billerbook liest die Fotos dort, wo du sie aufbewahrst, und verändert die Originale nie.",
    [("Jeder Ordner", "JPEG, TIFF, PNG, WebP, HEIC; Datum, Sterne und Bildunterschriften aus den Metadaten."), ("Lightroom Classic", "Sammlungen als Bestand, in ihrer Lightroom-Reihenfolge, auch einer eigenen. Das Plug-in exportiert die Druckdateien in voller Größe mit deinen Entwicklungen und später nur, was du geändert hast. Bücher aus dem Buch-Modul kommen mit ihren Seiten."), ("Capture One", "Alben, Projekte und Gruppen aus dem offenen Katalog oder der Session; verarbeitete Dateien werden über den Namen zugeordnet."), ("Webseiten und PDFs", "Eine Galerieseite oder HTML-Datei wird zu Kapiteln und Tafeln, ein PDF zu Seiten.")]),
   ("Layouts und Vorlagen", "Mit einem Stil anfangen.", "Sieben Vorlagen setzen Schriften, Farben, Umschlag und Seitenfolge: Bildband, Jahresband, Galerie, Botanik, Reisetagebuch, Hochzeit und Jahresrückblick zu Weihnachten. Danach gehört jede Seite dir.",
    [("Fotobuch-Layouts", "Tafeln im Satzspiegel nach Van de Graaf, Kapitelseiten, Textseiten, Diptychen und randlose Doppelseiten."), ("Freie Rahmen", "Rahmen in Millimetern verschieben und skalieren, mit Einrasten an Dritteln und am Satzspiegel."), ("Eigene Layouts", "Eine Seite als Layout speichern und auf jede Seite mit gleich vielen Fotos setzen."), ("Tönungen und Grafiken", "Schwarzweiß, vier Tönungen, Papierstrukturen und Hintergrundgrafiken.")]),
   ("Editionen", "Mehrere Bücher aus denselben Fotos.", "Ein ausführliches Hardcover quer für dich und ein kürzeres Softcover hochkant für die Familie teilen sich die Fotos. Jede Edition hat ihre eigene Druckerei, ihr Format und ihre Seitenzahl, und die Layouts passen sich beim Formatwechsel an.", None),
   ("Umschlag und Rücken", "Aus der Seitenzahl berechnet.", "Der Umschlag folgt aus Seitenzahl und Papier: Rückenbreite aus der Formel oder Tabelle der Druckerei, Einschlag und Falz aus dem Profil, oder exakt aus der Umschlagvorlage, die du bei der Druckerei lädst. ISBN-Barcodes werden als Vektoren gezeichnet.", None),
   ("Prüfen vor der Bestellung", "Drei Blicke aufs Buch.", "Die Prüfung listet, was eine Druckerei ablehnen würde. Der Softproof zeigt die Farben nach der CMYK-Umrechnung der Druckerei und markiert, was kippt. Die Seitenübersicht legt alle Doppelseiten auf einen Bogen.",
    [("Prüfung", "Geringe Auflösung, Text in der Klebezone, Seitengrenzen, Text, der nicht passt, kleine Schrift, Barcode-Regeln."), ("Softproof", "Das ICC-Profil der Druckerei auf dem Bildschirm, mit Warnung für Farben außerhalb des Farbraums."), ("Prüf-PDF", "Endformat, Sicherheitsabstand und Klebezone eingezeichnet, alle Hinweise nummeriert auf Seite 1."), ("Seitenübersicht", "Alle Doppelseiten auf A4-Bögen mit Seitenzahlen, Umschlag zuerst.")]),
  ],
  exports_h="Jede Datei, die Billerbook schreibt", exports_cols=["Export", "Was du bekommst"],
  exports=[("Inhalt-PDF", "Einzelseiten oder Doppelseiten, Endformat- und Beschnittrahmen, CMYK mit ICC-Profil oder sRGB, Text in Pfaden"), ("Umschlag-PDF", "Rücken, Buchrücken und Vorderseite auf einem Bogen; bei Heften ein vierseitiger Umschlag"), ("Prüf-PDF", "Hilfslinien und nummerierte Prüfhinweise"), ("Seitenübersicht als PDF", "Alle Doppelseiten auf A4-Querbögen mit Seitenzahlen"),
           ("IDML", "Bearbeitbares Layout für Affinity (kostenlos) und InDesign, Fotos im Ordner Links"), ("Bildschirm-PDF", "Kleine RGB-Datei der Doppelseiten"), ("HTML-Buch", "Interaktives Buch für deine Website, auf dem Handy Seite für Seite"), ("EPUB", "Festes Layout für E-Reader"),
           ("Bilder", "Seiten oder Doppelseiten als JPEG oder PNG; Instagram-Karussell in 1080 × 1350"), ("Dateiliste", "CSV und TXT aller Fotos mit Seite, Pfad und Lightroom-ID"), ("Originale", "Alle Fotos einer Edition in einem Ordner, nach Seite benannt"), (".billerbook", "Das ganze Projekt mit Fotos, zum Umziehen oder Archivieren")],
  idml_h="In Affinity oder InDesign fertig machen", idml_p="Manche Bücher brauchen einen letzten Durchgang in einem großen Layoutprogramm. Der IDML-Export öffnet in Affinity (kostenlos, von Canva) und in InDesign mit echten Bild- und Textrahmen, denselben Ausschnitten und den Fotos im Ordner Links. Hintergrundgrafiken, Seitenzahlen und Barcode bleiben im Druck-PDF.",
  ai_title="Billerbook und KI-Assistenten: Claude, ChatGPT, Codex und Cursor gestalten Fotobücher über MCP",
  ai_desc="Der MCP-Server von Billerbook hat 51 Werkzeuge. Claude Desktop, Codex oder Cursor verbinden sich lokal, ChatGPT und claude.ai mit einem Kopplungscode. Der Assistent liest Datenblätter von Druckereien, gestaltet das Buch und prüft jede Doppelseite.",
  ai_h1="Lass deinen Assistenten das Buch bauen.", ai_lead="Billerbook bringt einen MCP-Server mit 51 Werkzeugen mit. Der Assistent arbeitet im selben Projekt, das du in der App siehst, und die App aktualisiert sich, während er arbeitet.",
  ai_can_h="Was er kann", ai_can_h2="Und was du prüfst.",
  ai_can=[("Den Druck einrichten", "Das Datenblatt einer Druckerei lesen, auf die Edition anwenden und als Profil speichern; eine Umschlagvorlage importieren."), ("Gestalten", "Seiten füllen, eine Vorlage anwenden, Fotos setzen und zuschneiden, Bildunterschriften schreiben, den Umschlag setzen."),
          ("Die eigene Arbeit ansehen", "Jede Doppelseite als Bild und das ganze Buch als Kontaktbogen sehen und korrigieren, was nicht stimmt."), ("Prüfen und exportieren", "Prüfung und Softproof laufen lassen, Druck-PDFs, Prüf-PDF, IDML oder ein HTML-Buch exportieren.")],
  ai_local_h="Auf deinem Mac", ai_local_p="Claude Desktop, Claude Code, Codex, Cursor und LM Studio starten den MCP-Server von Billerbook selbst. „KI verbinden“ in der App trägt ihn mit einem Klick in Claude Desktop ein; das ist der Eintrag:",
  ai_remote_h="ChatGPT und claude.ai", ai_remote_p="Assistenten in der Cloud brauchen eine öffentliche Adresse, die zu deinem Mac führt. „KI verbinden“ startet einen Tunnel, du trägst die Adresse als Connector ein und bestätigst mit einem sechsstelligen Code aus der App. Der Code gilt einmal und zehn Minuten.",
  ai_remote_list=[("Keine Dateipfade", "Ein Assistent aus der Cloud bekommt keine Werkzeuge, die Pfade auf deinem Mac nehmen: keine Ordner, Kataloge, Schriften oder Exportordner."), ("Anmeldung mit OAuth 2.1", "PKCE, Tokens nur als Hash gespeichert, Refresh-Tokens wechseln bei jeder Nutzung."), ("Trennen", "Ein Klick in der App entfernt einen Client mit seinen Tokens.")],
  ai_prompts_h="Was du fragen kannst",
  ai_prompts=["Hier ist das Datenblatt meiner Druckerei. Richte das Hardcover genau so ein und sag mir, welchen Wert du woher hast.",
              "Mach ein Fotobuch aus ~/Bilder/Sommer 2026. Hardcover A4 quer, Fünf-Sterne-Fotos bekommen eine eigene Seite. Sieh dir jede Doppelseite an und korrigier, was unausgewogen wirkt.",
              "Mach in meinem Projekt Jahr 2026 ein Softcover hochkant für die Familie, nur mit den Vier- und Fünf-Sterne-Fotos, höchstens 60 Seiten.",
              "Sieh dir das ganze Buch an. Welche Layouts wiederholen sich zu oft, und wo beginnt ein Kapitel nicht auf einer rechten Seite?",
              "Mach aus Jahr 2026 einen Jahresrückblick zu Weihnachten, prüf ihn im Softproof und exportier die Druck-PDFs."],
  ai_docs="Alle Werkzeuge und die Einrichtung in der MCP-Dokumentation",
 ),
}


# ---------- Rendering (Benchkey layout) ----------
MCP_DOC = REPO + "/blob/main/docs/mcp.md"
import hashlib as _hl
# Content hash in the stylesheet URL: browsers keep /assets/ for a week, a changed file gets a new URL.
CSS_V = _hl.sha256(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "site.css"), "rb").read()).hexdigest()[:10]
LOGO = '<img src="{root}assets/img/icon.png" alt="" width="22" height="22">'

def urls(t, root):
    k = K[t['lang']]
    p = root + t['path']
    return {"home": p or "./", "how": f"{p}{k['slug_how']}/", "ai": f"{p}{k['slug_ai']}/", "shops": f"{p}{t['shops_slug']}/", "sc": f"{p}{t['sc_slug']}/",
            "imp": f"{p}impressum.html", "priv": f"{p}datenschutz.html", "gh": REPO, "rel": REPO + "/releases", "mcp": MCP_DOC, "llms": root + "llms.txt"}

def alt_paths(page):
    """English and German URL of the same page."""
    en, de = K['en'], K['de']
    m = {"home": ("", "de/"), "how": (en['slug_how'] + "/", "de/" + de['slug_how'] + "/"), "ai": (en['slug_ai'] + "/", "de/" + de['slug_ai'] + "/"),
         "shops": ("print-shops/", "de/druckereien/"), "sc": ("botanical-stories/", "de/botanical-stories/"),
         "imp": ("impressum.html", "de/impressum.html"), "priv": ("datenschutz.html", "de/datenschutz.html")}
    return m[page]

def pill(t, root, cur):
    k = K[t['lang']]; u = urls(t, root)
    other_lang = 'de' if t['lang'] == 'en' else 'en'
    en_p, de_p = alt_paths(cur)
    other_href = root + (de_p if t['lang'] == 'en' else en_p)
    links = "".join(f'<a href="{u[i]}"{" aria-current=\"page\"" if i == cur else ""}>{esc(n)}</a>' for i, n in k['nav'])
    mlinks = "".join(f'<a href="{u[i]}">{esc(n)}</a>' for i, n in k['nav'])
    return f"""<a class="skip" href="#main">{'Skip to content' if t['lang'] == 'en' else 'Zum Inhalt'}</a>
<header class="pill">
 <a class="mark" href="{u['home']}" aria-label="Billerbook">{LOGO.format(root=root)}<span>Billerbook</span></a>
 <nav aria-label="{'Main' if t['lang'] == 'en' else 'Hauptnavigation'}">{links}</nav>
 <span class="sep" aria-hidden="true"></span>
 <a class="lang" href="{other_href}" hreflang="{other_lang}" lang="{other_lang}">{t['other_short']}</a>
 <a class="btn go" href="{DL}">{esc(t['dl_short'])}</a>
 <details class="menu"><summary aria-label="{k['menu']}"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 5h14M2 13h14" stroke="currentColor" stroke-width="1.6"/></svg></summary><div>{mlinks}<a href="{DL}">{esc(t['dl'])}</a><a href="{other_href}" hreflang="{other_lang}" lang="{other_lang}">{t['other_label']}</a></div></details>
</header>
<div class="frame">"""

def foot(t, root, cur):
    k = K[t['lang']]; u = urls(t, root)
    en_p, de_p = alt_paths(cur)
    u["other"] = root + (de_p if t['lang'] == 'en' else en_p)
    cols = "".join(f'<div><h2>{esc(h)}</h2><ul>{"".join(f"<li><a href=\"{u[i]}\">{esc(n)}</a></li>" for i, n in items)}</ul></div>' for h, items in k['foot_cols'])
    return f"""<footer>
 <div class="cols">
  <div><a class="mark u-mark" href="{u['home']}">{LOGO.format(root=root)}Billerbook</a><p class="u-about">{esc(k['foot_about'])}</p></div>
  {cols}
 </div>
 <div class="base"><span>{esc(k['foot_base'])}</span><span>Version {VERSION}</span></div>
</footer>
</div>
<script>
(()=>{{for(const t of document.querySelectorAll('.tabs')){{const b=[...t.querySelectorAll('button')];const p=b.map(x=>document.getElementById(x.getAttribute('aria-controls')));
b.forEach((x,i)=>{{x.addEventListener('click',()=>{{b.forEach((y,j)=>{{y.setAttribute('aria-selected',i===j);y.tabIndex=i===j?0:-1;p[j].hidden=i!==j}})}});
x.addEventListener('keydown',e=>{{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;const n=(i+(e.key==='ArrowRight'?1:b.length-1))%b.length;b[n].click();b[n].focus()}})}});
t.hidden=false;p.forEach((x,j)=>x.hidden=j!==0)}}}})();
addEventListener('message',e=>{{const f=[...document.querySelectorAll('.bookframe iframe')].find(x=>x.contentWindow===e.source);if(f&&e.origin===location.origin&&e.data&&e.data.billerbook==='height'&&e.data.h>0){{f.style.aspectRatio='auto';f.style.height=e.data.h+'px'}}}});
</script>
</body></html>"""

def head2(t, title, desc, page, root, ld=None, og="og.jpg"):
    en_p, de_p = alt_paths(page)
    canonical = BASE + (de_p if t['lang'] == 'de' else en_p)
    return f"""<!doctype html>
<html lang="{t['lang']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canonical}">
<link rel="alternate" hreflang="en" href="{BASE + en_p}">
<link rel="alternate" hreflang="de" href="{BASE + de_p}">
<link rel="alternate" hreflang="x-default" href="{BASE + en_p}">
<meta name="theme-color" content="#f7f6f2">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{BASE}assets/img/{og}">
<meta property="og:url" content="{canonical}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="{root}assets/img/favicon.png">
<link rel="apple-touch-icon" href="{root}assets/img/apple-touch-icon.png">
<link rel="preload" href="{root}assets/fonts/geist-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{root}assets/site.css?v={CSS_V}">
{"".join('<script type="application/ld+json">' + _json.dumps(x, ensure_ascii=False).replace("</", "<\\/") + '</script>' for x in (ld or []))}
</head>
<body>"""

def sh(a, b, cls="", tag="h2", id_=""):
    return f'<{tag} class="sh {cls}"{f" id={chr(34)}{id_}{chr(34)}" if id_ else ""}>{esc(a)}<span>{esc(b)}</span></{tag}>'

def st(kind, label):
    return f'<span class="st{" " + kind if kind else ""}">{esc(label)}</span>'

def ends(t, root, k):
    return f"""<section class="end" data-section="cta" aria-labelledby="eh">
 <div class="cells" aria-hidden="true"></div>
 <div class="wrap u-rel">
  <h2 id="eh">{esc(k['end_h'])}<br><span class="u">{esc(k['end_u'])}<svg viewBox="0 0 420 14" preserveAspectRatio="none" aria-hidden="true"><path d="M2 9C90 3 220 2 418 8" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/></svg></span></h2>
  <div class="ctas"><a class="btn go" href="{DL}">{esc(t['dl'])} <span class="ar" aria-hidden="true">&rarr;</span></a><a class="btn ghost" href="{REPO}">{esc(t['gh'])}</a></div>
  <p class="meta u-meta">{esc(t['meta'])}</p>
 </div>
</section>"""

def home(t):
    root = "../" if t["path"] else ""
    k = K[t['lang']]; u = urls(t, root); en = t['lang'] == 'en'
    rows = "".join(f'<li><span>{esc(a)}<small>{esc(b)}</small></span>{st(c, d)}</li>' for a, b, c, d in k['sheet_rows'])
    specs = "".join(f'<div><b>{esc(a)}</b>{esc(b)}</div>' for a, b in k['specs'])
    # print shop table from the real profile data
    trs = []
    for shp in [s for s in SHOPS if s['id'] not in ('custom',)][:8]:
        bs = shp['bindings']
        binds = ", ".join(BIND[t['lang']].get(b, b).split(' / ')[0].split(' (')[0] for b in bs)
        spines = sorted({shop_spine(b) for b in bs.values()})
        stat = 'verified' if all(b['status'] == 'verified' for b in bs.values()) else ('partial' if any(b['status'] != 'manual' for b in bs.values()) else 'manual')
        trs.append(f'<tr><td>{esc(shp["name"])}<small>{esc(shp["region"])}</small></td><td>{esc(binds)}</td><td>{esc(" / ".join(t["spine_names"][x] for x in spines))}</td><td>{st("ok" if stat == "verified" else "", t["status_names"][stat].split(",")[0])}</td></tr>')
    thread = "".join(f'<p class="msg {w}">{esc(x)}{f"<small>{esc(by)}</small>" if by else ""}</p>' for w, x, by in k['thread'])
    imgs = {"lr": "k-lr", "c1": "k-c1", "folder": "k-folder", "web": "k-web"}
    tabs = "".join(f'<button role="tab" id="t-{i}" aria-controls="p-{i}" aria-selected="{"true" if n == 0 else "false"}"{" tabindex=\"-1\"" if n else ""}>{esc(lab)}</button>' for n, (i, lab) in enumerate(k['tabs']))
    panels = []
    for i, _ in k['tabs']:
        bar, feed, c1, c2, c3 = k['panels'][i]
        lis = "".join(f'<li><time>{esc(a)}</time><span>{esc(b)}</span>{st(c, d)}</li>' for a, b, c, d in feed)
        panels.append(f'''<div class="panel" id="p-{i}" role="tabpanel" aria-labelledby="t-{i}">
   <div class="bay"><img src="{root}assets/img/{imgs[i]}-1440.webp" srcset="{root}assets/img/{imgs[i]}-800.webp 800w, {root}assets/img/{imgs[i]}-1440.webp 1200w" sizes="(max-width:860px) 100vw, 1216px" width="1200" height="848" alt="" loading="lazy">
    <div class="feed"><div class="bar"><strong>{esc(bar)}</strong>{st("ok", "OK")}</div><ol>{lis}</ol></div>
    <div class="lock-card"><small>{esc(c1)}</small><b>{esc(c2)}</b><small>{esc(c3)}</small></div></div></div>''')
    notes = "".join(f'<p><b>{esc(a)}</b> {esc(b)}</p>' for a, b in k['notes'])
    steps = "".join(f'<li{" class=\"on\"" if n == 0 else ""}><b>{esc(a)}</b> {esc(b)}</li>' for n, (a, b) in enumerate(k['steps']))
    seg = "".join(f'<span{" class=\"on\"" if n == 0 else ""}>{esc(s)}</span>' for n, s in enumerate(k['exp_seg']))
    flds = "".join(f'<label>{esc(a)}</label><div class="fld"><span>{esc(b)}</span><span aria-hidden="true">&#8964;</span></div>' for a, b in k['exp_fields'])
    chk = "".join(f'<span{" class=\"on\"" if on else ""}>{esc(a)}</span>' for a, on in k['exp_chk'])
    keys = "".join(f'<div><kbd>{esc(a)}</kbd><span>{esc(b)}</span></div>' for a, b in k['keys'])
    o = k['off_svg']
    log = "".join(f'<article><h3>Billerbook {esc(v)}</h3><p>{esc(x)}</p><time datetime="{d}">{d}</time></article>' for v, x, d in k['log'])
    faq = "".join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in t['faq'])
    story = "".join(f'<p>{p}</p>' for p in t['story'])
    out = [head2(t, t['title'], t['desc'], "home", root, ld=app_ld(t, BASE + t['path'])), pill(t, root, "home")]
    out.append(f"""<main id="main">
<section class="hero" data-section="hero" aria-labelledby="h">
 <div class="cells" aria-hidden="true"></div>
 <div class="wrap">
  <div>
   <h1 id="h">{k['h1']}</h1>
   <p class="lede">{k['lede']}</p>
   <p class="who">{esc(k['who'])}</p>
   <div class="ctas"><a class="btn go" href="{DL}">{esc(t['dl'])} <span class="ar" aria-hidden="true">&rarr;</span></a><a class="btn ghost" href="{u['how']}">{esc(k['cta2'])}</a></div>
   <p class="meta">{esc(t['meta'])}</p>
  </div>
  <div class="stage">
   <span class="ring" aria-hidden="true"></span>
   <div class="sheet" role="group" aria-label="{'Sample spread with its print data' if en else 'Beispiel-Doppelseite mit Druckdaten'}">
    <div class="top"><span><b>{esc(k['sheet_top'])}</b><br><small>{esc(k['sheet_sub'])}</small></span><small>{esc(k['sheet_tag'])}</small></div>
    <div class="spread"><img src="{root}assets/img/k-hero-spread.webp" width="1200" height="424" alt="{'Opening spread of Botanical Stories: the Greifswald Botanic Garden glasshouses' if en else 'Auftakt von Botanical Stories: die Gewächshäuser des Botanischen Gartens Greifswald'}"><i></i><i></i><i></i><i></i></div>
    <div class="cap"><span>{esc(k['sheet_cap'][0])}</span><span>{esc(k['sheet_cap'][1])}</span></div>
    <div class="body"><h2>{esc(k['sheet_h'])}</h2><ul class="mach">{rows}</ul>
     <div class="keys"><kbd>{'Space' if en else 'Leertaste'}</kbd><kbd>F</kbd><kbd>V</kbd><span>{esc(k['sheet_keys'].split(' · ')[0].split(' ', 1)[1] if ' ' in k['sheet_keys'] else '')}</span></div></div>
   </div>
   <p class="toast" role="status"><i aria-hidden="true"></i>{esc(k['toast1'])}</p>
   <p class="toast b"><i aria-hidden="true"></i>{esc(k['toast2'])}</p>
  </div>
 </div>
</section>

<section class="specs" data-section="exports" aria-label="{esc(k['specs_lead'])}">
 <div>{esc(k['specs_lead'])}</div>{specs}
</section>

<section class="state" data-section="statement"><div class="wrap"><p>{k['state']}</p></div></section>

<section class="board" data-section="print-shops" aria-labelledby="bh">
 <div>
  <div class="intro">{sh(k['board_h'], k['board_h2'], id_="bh")}<p>{esc(k['board_p'])}</p></div>
  <div class="ui" role="group" aria-label="{esc(k['board_bar'])}">
   <div class="bar"><strong>{esc(k['board_bar'])}</strong><a class="q u-nodeco" href="{u['shops']}"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor"/><path d="m9.5 9.5 3 3" stroke="currentColor"/></svg>{esc(k['board_q'])}</a></div>
   <table class="mt"><caption class="vh">{esc(k['board_bar'])}</caption>
    <thead><tr>{"".join(f'<th scope="col">{esc(c)}</th>' for c in k['board_cols'])}</tr></thead>
    <tbody>{"".join(trs)}</tbody></table>
  </div>
  <p class="u-mt18"><a href="{u['shops']}">{esc(t['shops_more'])}</a></p>
 </div>
 <div class="thread"><h3>{esc(k['thread_h'])}</h3><p>{esc(k['thread_p'])}</p>{thread}</div>
</section>

<section class="field" data-section="sources" aria-labelledby="fh">
 <div class="wrap">
  {sh(k['field_h'], k['field_h2'], id_="fh")}
  <div class="tabs" role="tablist" aria-label="{'Photo sources' if en else 'Bildquellen'}" hidden>{tabs}</div>
  {"".join(panels)}
  <div class="notes">{notes}</div>
 </div>
</section>

<section class="steps" data-section="workflow" aria-labelledby="sh">
 <div>
  {sh(k['steps_h'], k['steps_h2'], "acc", id_="sh")}
  <div class="ctas"><a class="btn go" href="{DL}">{esc(k['steps_cta'])}</a></div>
  <ol>{steps}</ol>
 </div>
 <div>
  <div class="ui tb" role="group" aria-label="{'Export dialog (sample)' if en else 'Export-Dialog (Beispiel)'}">
   <div class="seg">{seg}</div>
   <div class="form">{flds}<label>{esc(k['exp_label'])}</label><div class="chk">{chk}</div><label>{esc(k['exp_pages'][0])}</label><div class="fld"><span>{esc(k['exp_pages'][1])}</span></div></div>
   <div class="foot"><span>{esc(k['exp_foot'][0])}</span><b>{esc(k['exp_foot'][1])}</b></div>
  </div>
 </div>
</section>

<section class="block" data-section="keys" aria-labelledby="kh">
 {sh(k['keys_h'], k['keys_h2'], id_="kh")}
 <div class="keys-grid">{keys}</div>
</section>

<section class="show" data-section="overview" aria-labelledby="ovh">
 <div>{sh(k['show_h'], k['show_h2'], "acc", id_="ovh")}<p>{esc(k['show_p'])}</p><a class="btn ghost" href="{u['sc']}">{esc(k['show_cta'])} <span class="ar" aria-hidden="true">&rarr;</span></a></div>
 <div><figure class="ovfig"><img src="{root}assets/img/k-overview.webp" width="1600" height="771" alt="{esc(k['show_cap'])}" loading="lazy"><figcaption>{esc(k['show_cap'])}</figcaption></figure></div>
</section>

<section class="offline" data-section="local" aria-labelledby="oh">
 <div>{sh(k['off_h'], k['off_h2'], id_="oh")}<p>{esc(k['off_p'])}</p></div>
 <div>
  <svg viewBox="0 0 560 380" role="img" aria-labelledby="dt"><title id="dt">{esc(k['off_h2'])}</title>
   <g font-family="Geist,sans-serif" font-size="14" fill="var(--ink)">
    <rect x="10" y="40" width="180" height="64" rx="10" fill="var(--white)" stroke="var(--line)"/><text x="100" y="68" text-anchor="middle">{esc(o['photos'])}</text><text x="100" y="88" text-anchor="middle" fill="var(--mute)" font-size="11">{esc(o['photos2'])}</text>
    <rect x="205" y="140" width="150" height="76" rx="12" fill="var(--field)" stroke="var(--field)"/><text x="280" y="174" text-anchor="middle" fill="var(--on-field)" font-weight="500">{esc(o['app'])}</text><text x="280" y="194" text-anchor="middle" fill="var(--on-field-mute)" font-size="12">{esc(o['app2'])}</text>
    <rect x="390" y="40" width="150" height="64" rx="10" fill="var(--white)" stroke="var(--line)"/><text x="465" y="68" text-anchor="middle">{esc(o['pdf'])}</text><text x="465" y="88" text-anchor="middle" fill="var(--mute)" font-size="12">{esc(o['pdf2'])}</text>
    <rect x="390" y="270" width="150" height="64" rx="10" fill="var(--white)" stroke="var(--line)"/><text x="465" y="298" text-anchor="middle">{esc(o['shop'])}</text><text x="465" y="318" text-anchor="middle" fill="var(--mute)" font-size="12">{esc(o['shop2'])}</text>
    <rect x="10" y="270" width="180" height="64" rx="10" fill="var(--white)" stroke="var(--accent)" stroke-dasharray="4 4"/><text x="100" y="298" text-anchor="middle">{esc(o['ai'])}</text><text x="100" y="318" text-anchor="middle" fill="var(--mute)" font-size="11">{esc(o['ai2'])}</text>
   </g>
   <path class="draw" d="M190 72h20q30 0 30 30v38M355 160q35 0 35-30V104M465 104v166" fill="none" stroke="var(--soft)"/>
   <path d="M190 302h15q35 0 35-35v-51" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3 5"/>
   <g class="pulse u-pulse"><circle cx="280" cy="178" r="96" fill="none" stroke="var(--line)" stroke-dasharray="2 6"/></g>
  </svg>
 </div>
</section>

<section class="log" data-section="story" aria-labelledby="sth">
 <div><h2 class="sh" id="sth">{esc(k['story_h'])}</h2></div>
 <div class="prose u-story"><div class="u-w620">{story}</div></div>
</section>

<section class="log" id="releases" data-section="releases" aria-labelledby="lh">
 <div><h2 class="sh" id="lh">{esc(k['log_h'])}</h2><p class="sub">{esc(k['log_sub'])}</p><p class="sub"><a href="{REPO}/releases">GitHub Releases</a></p></div>
 <div>{log}</div>
</section>

<section class="block faq" id="faq" data-section="faq" aria-labelledby="qh">
 <div class="split"><div><h2 class="sh" id="qh">{esc(k['faq_h'])}</h2></div><div>{faq}</div></div>
</section>

{ends(t, root, k)}
</main>""")
    out.append(foot(t, root, "home"))
    return "\n".join(out)

def ihead(h1, lead):
    return f'<section class="ihead"><h1>{esc(h1)}</h1><p>{esc(lead)}</p></section>'

def how_page(t):
    root = "../../" if t["path"] else "../"
    k = K[t['lang']]; en = t['lang'] == 'en'
    out = [head2(t, k['how_title'], k['how_desc'], "how", root), pill(t, root, "how"), '<main id="main">', ihead(k['how_h1'], k['how_lead'])]
    for n, (a, b, p, items) in enumerate(k['how_blocks']):
        right = ''
        if items:
            right = '<ul class="ticks">' + "".join(f'<li><b>{esc(x)}.</b> {esc(y)}</li>' for x, y in items) + '</ul>'
        elif n == 2:
            right = f'<div class="u-stack"><figure class="proof"><span class="cm"></span><img src="{root}assets/img/hc-spread-1.webp" width="2000" height="707" alt="{"Landscape hardcover spread" if en else "Doppelseite Hardcover quer"}" loading="lazy"><figcaption>{t["ed_caps"][0]}</figcaption></figure><figure class="proof u-w70"><span class="cm"></span><img src="{root}assets/img/sc-spread-2.webp" width="1400" height="990" alt="{"Portrait softcover spread with the same photos" if en else "Softcover-Doppelseite hochkant mit denselben Fotos"}" loading="lazy"><figcaption>{t["ed_caps"][1]}</figcaption></figure></div>'
        elif n == 3:
            right = f'<figure class="ovfig"><img src="{root}assets/img/app-cover-012.webp" width="2000" height="1250" alt="{"The cover editor with back, spine and front" if en else "Der Umschlag-Editor mit Rückseite, Buchrücken und Vorderseite"}" loading="lazy"></figure>'
        out.append(f'<section class="block"><div class="split"><div><p class="kick">{n + 1:02d} · {esc(a)}</p>{sh(b, "", tag="h2")}<p>{esc(p)}</p></div><div>{right}</div></div></section>')
        if n == 1:
            keys = "".join(f'<div><kbd>{esc(x)}</kbd><span>{esc(y)}</span></div>' for x, y in k['keys'])
            out.append(f'<section class="block">{sh(k["keys_h"], k["keys_h2"])}<div class="keys-grid">{keys}</div></section>')
    rows = "".join(f'<tr><td>{esc(a)}</td><td>{esc(b)}</td></tr>' for a, b in k['exports'])
    out.append(f'<section class="block"><div class="split"><div><p class="kick">{len(k["how_blocks"]) + 1:02d} · Export</p><h2 class="sh">{esc(k["exports_h"])}</h2></div><div><table class="xt"><thead><tr><th>{esc(k["exports_cols"][0])}</th><th>{esc(k["exports_cols"][1])}</th></tr></thead><tbody>{rows}</tbody></table></div></div></section>')
    out.append(f'<section class="block"><div class="split"><div><p class="kick">{len(k["how_blocks"]) + 2:02d} · Affinity · InDesign</p><h2 class="sh">{esc(k["idml_h"])}</h2></div><div class="prose"><p>{esc(k["idml_p"])}</p></div></div></section>')
    out.append(ends(t, root, k) + '</main>')
    out.append(foot(t, root, "how"))
    return "\n".join(out)

def ai_page(t):
    root = "../../" if t["path"] else "../"
    k = K[t['lang']]
    out = [head2(t, k['ai_title'], k['ai_desc'], "ai", root), pill(t, root, "ai"), '<main id="main">', ihead(k['ai_h1'], k['ai_lead'])]
    can = '<ul class="ticks">' + "".join(f'<li><b>{esc(a)}.</b> {esc(b)}</li>' for a, b in k['ai_can']) + '</ul>'
    out.append(f'<section class="block"><div class="split"><div>{sh(k["ai_can_h"], k["ai_can_h2"])}</div><div>{can}</div></div></section>')
    thread = "".join(f'<p class="msg {w}">{esc(x)}{f"<small>{esc(by)}</small>" if by else ""}</p>' for w, x, by in k['thread'])
    out.append(f'<section class="board u-board-ai"><div><h2 class="sh">{esc(k["thread_h"])}</h2><p class="u-lead">{esc(k["thread_p"])}</p><figure class="ovfig u-mt36"><img src="{"../" * (2 if t["path"] else 1)}assets/img/k-overview.webp" width="1600" height="771" alt="{esc(k["show_cap"])}" loading="lazy"><figcaption>view_overview · {esc(k["show_cap"])}</figcaption></figure></div><div class="thread">{thread}</div></section>')
    cfg = esc('{\n  "mcpServers": {\n    "billerbook": {\n      "command": "/Applications/Billerbook.app/Contents/MacOS/Billerbook",\n      "args": ["/Applications/Billerbook.app/Contents/Resources/app/mcp.mjs"],\n      "env": { "ELECTRON_RUN_AS_NODE": "1" }\n    }\n  }\n}')
    out.append(f'<section class="block"><div class="split"><div><h2 class="sh">{esc(k["ai_local_h"])}</h2><p>{esc(k["ai_local_p"])}</p></div><div><pre class="code">{cfg}</pre></div></div></section>')
    rl = '<ul class="ticks">' + "".join(f'<li><b>{esc(a)}.</b> {esc(b)}</li>' for a, b in k['ai_remote_list']) + '</ul>'
    out.append(f'<section class="block"><div class="split"><div><h2 class="sh">{esc(k["ai_remote_h"])}</h2><p>{esc(k["ai_remote_p"])}</p></div><div>{rl}</div></div></section>')
    pr = "".join(f'<p>{esc(x)}</p>' for x in k['ai_prompts'])
    out.append(f'<section class="block"><div class="split"><div><h2 class="sh">{esc(k["ai_prompts_h"])}</h2><p><a href="{MCP_DOC}">{esc(k["ai_docs"])}</a></p></div><div class="prompts">{pr}</div></div></section>')
    out.append(ends(t, root, k) + '</main>')
    out.append(foot(t, root, "ai"))
    return "\n".join(out)

def shops_page2(t):
    root = "../../" if t["path"] else "../"
    lang = t['lang']
    out = [head2(t, t['shops_title'], t['shops_desc'], "shops", root, ld=shops_ld(t, BASE + t['path'] + t['shops_slug'] + '/')), pill(t, root, "shops"), '<main id="main">', ihead(t['shops_h1'], t['shops_intro'])]
    for shp in SHOPS:
        left = f'<div><h2>{esc(shp["name"])}</h2><p class="muted">{esc(shp["region"])}{" · <a href=\"" + esc(shp["url"]) + "\">" + esc(shp["url"].replace("https://", "")) + "</a>" if shp.get("url") else ""}</p><p class="muted">{esc(L(shp.get("notes") or {}, lang))}</p>'
        src = ' '.join(f'<a href="{esc(x)}" rel="nofollow noopener">[{i + 1}]</a>' for i, x in enumerate(shp['sources']))
        left += f'<p class="note">{esc(t["lbl_sources"])}: {src}<br>{esc(t["lbl_checked"])} {esc(shp.get("checked", ""))}</p></div>'
        right = []
        for kb, b in shp['bindings'].items():
            cov = b['cover']
            cover = f"{t['lbl_wrap']} {mm(cov['wrap'])}" + (f", {t['lbl_joint']} {mm(cov['joint'])}" if cov.get('joint') else '') + (f", {t['lbl_hinge']} {mm(cov['hinge'])}" if cov.get('hinge') else '')
            pages = b.get('pages') or {}
            pr = ' · '.join(x for x in [f"min {pages['min']}" if pages.get('min') else '', f"max {pages['max']}" if pages.get('max') else '', f"step {pages['step']}" if pages.get('step') else ''] if x) or '–'
            papers = ', '.join(L(x['label'], lang) for x in b.get('papers', []))
            rows = [(t['lbl_bleed'], mm(b['bleed'])), (t['lbl_safety'], mm(b['safety'])),
                    (t['col'][2], t['interior_names'][b['interior']] + (f", {t['lbl_blank']}" if b.get('blankEnds') else '')),
                    (t['lbl_pages'], pr), (t['lbl_colour'], 'sRGB' if b['colour'] == 'srgb' else 'CMYK'),
                    (t['col'][3], t['spine_names'][shop_spine(b)]), (t['lbl_cover'], cover)]
            if papers: rows.append((t['lbl_papers'], papers))
            rows.append((t['lbl_formats'], ', '.join(L(f['label'], lang) for f in shp['formats'] if f['binding'] == kb)))
            tag_cls = ' ok' if b['status'] == 'verified' else ''
            right.append(f'<h3>{esc(BIND[lang].get(kb, kb.capitalize()))} <span class="tag{tag_cls}">{esc(t["status_names"].get(b["status"], b["status"]))}</span></h3><table class="xt"><tbody>' + ''.join(f'<tr><td>{esc(a)}</td><td>{esc(v)}</td></tr>' for a, v in rows) + '</tbody></table>')
        out.append(f'<section class="shop" id="{shp["id"]}">{left}<div>{"".join(right)}</div></section>')
    out.append(f'<section class="block"><div class="prose"><p>{esc(t["lbl_any"])}</p></div></section>')
    out.append(ends(t, root, K[lang]) + '</main>')
    out.append(foot(t, root, "shops"))
    return "\n".join(out)

def showcase_page2(t):
    root = "../../" if t["path"] else "../"
    en = t["lang"] == "en"; k = K[t['lang']]
    url = BASE + t['path'] + t['sc_slug'] + '/'
    book = f"{root}books/botanical-stories/index.html"
    out = [head2(t, t['sc_title'], t['sc_desc'], "sc", root, ld=showcase_ld(t, url), og="bs-og.jpg"), pill(t, root, "sc"), '<main id="main">']
    out.append(f"""<section class="hero" aria-labelledby="h">
 <div class="cells" aria-hidden="true"></div>
 <div class="wrap">
  <div><p class="kick">{esc(t['sc_eyebrow'])}</p><h1 id="h">{t['sc_h1'].replace("<span class='hl'>", "<em>").replace("</span>", "</em>")}</h1><p class="lede">{esc(t['sc_lead'])}</p>
   <div class="ctas"><a class="btn go" href="{DL}">{esc(t['sc_cta'])} <span class="ar" aria-hidden="true">&rarr;</span></a><a class="btn ghost" href="#book">{esc(t['sc_book_h'])}</a></div></div>
  <div class="stage"><span class="ring" aria-hidden="true"></span><figure class="proof u-w520"><span class="cm"></span><img src="{root}assets/img/bs-cover.webp" width="1200" height="854" alt="{"Botanical Stories, cover" if en else "Botanical Stories, Umschlag"}"><figcaption>Hardcover · 297 × 210 mm · WIRmachenDRUCK</figcaption></figure></div>
 </div>
</section>
<section class="field" id="book" aria-labelledby="bk"><div class="wrap">
 {sh(t['sc_book_h'], t['sc_book_note'], id_="bk")}
 <div class="bookframe"><iframe src="{book}" title="Botanical Stories" loading="lazy" allow="fullscreen" allowfullscreen></iframe></div>
</div></section>
<section class="block" aria-labelledby="mk"><div class="split"><div><h2 class="sh acc" id="mk">{esc(t['sc_how_h'])}</h2></div>
 <div><ul class="ticks">{"".join(f'<li><b>{esc(a)}.</b> {esc(b)}</li>' for a, b in t['sc_how'])}</ul></div></div></section>
<section class="block" aria-labelledby="sp">{sh(t['sc_spreads_h'], "", id_="sp")}
 <div class="u-stack u-mt36">{"".join(f'<figure class="proof"><span class="cm"></span><img src="{root}assets/img/{f}" width="2400" height="848" alt="{esc(a_en if en else a_de)}" loading="lazy"><figcaption>{esc(a_en if en else a_de)}</figcaption></figure>' for f, a_en, a_de in SPREADS)}</div>
</section>
<section class="block" aria-labelledby="gl">{sh(t['sc_galleries'], "", id_="gl")}
 <ul class="gal u-mt28">{"".join(f'<li><a href="https://www.tillheidrich.de/gallery/{g}/">{esc(n)}</a></li>' for n, g in GALLERIES)}</ul>
</section>
{ends(t, root, k)}
</main>""")
    out.append(foot(t, root, "sc"))
    return "\n".join(out)

def legal2(t, key, pages):
    title, body = pages[key]
    root = "../" if t["path"] else ""
    note = EN_NOTE if t["lang"] == "en" else ""
    return "\n".join([head2(t, f"{title} · Billerbook", title, "imp" if key == "impressum" else "priv", root), pill(t, root, "imp" if key == "impressum" else "priv"),
                      f'<main id="main"><section class="ihead"><h1>{title}</h1><p></p></section><section class="block"><div class="legal-body">{note}{body}</div></section></main>', foot(t, root, "imp" if key == "impressum" else "priv")])

def main():
    mail = os.environ.get("CONTACT_EMAIL", "").strip()
    pages = legal_pages(html.escape(mail) if mail else None)
    if not mail:
        print("warning: CONTACT_EMAIL not set, imprint links to the operator's main imprint for e-mail contact")
    here = os.path.dirname(os.path.abspath(__file__))
    pub = os.path.join(here, "public")
    if os.path.exists(pub): shutil.rmtree(pub)
    shutil.copytree(os.path.join(here, "assets"), os.path.join(pub, "assets"))
    if os.path.isdir(os.path.join(here, "books")): shutil.copytree(os.path.join(here, "books"), os.path.join(pub, "books"))
    def w(rel, s):
        f = os.path.join(pub, rel); os.makedirs(os.path.dirname(f), exist_ok=True); open(f, "w").write(s)
    urls_ = []
    for t in T.values():
        k = K[t['lang']]; p = t['path']
        w(p + "index.html", home(t))
        w(p + k['slug_how'] + "/index.html", how_page(t))
        w(p + k['slug_ai'] + "/index.html", ai_page(t))
        w(p + t['shops_slug'] + "/index.html", shops_page2(t))
        w(p + t['sc_slug'] + "/index.html", showcase_page2(t))
        for key in pages: w(p + key + ".html", legal2(t, key, pages))
        urls_ += [p, p + k['slug_how'] + "/", p + k['slug_ai'] + "/", p + t['shops_slug'] + "/", p + t['sc_slug'] + "/", p + "impressum.html", p + "datenschutz.html"]
    w("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {BASE}sitemap.xml\n")
    w("llms.txt", llms_txt())
    w("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<url><loc>{BASE}{x}</loc></url>" for x in urls_) + "</urlset>\n")
    print("built", pub)

if __name__ == "__main__": main()
