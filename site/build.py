#!/usr/bin/env python3
"""Generates the Billerbook marketing site (English at /, German at /de/).
Edit the copy in T below, run `CONTACT_EMAIL=... python3 build.py`, commit, push. Coolify serves `public/`.
The contact address for imprint and privacy pages comes from the CONTACT_EMAIL environment variable."""
import os, sys, html, shutil

REPO = "https://github.com/tillheidrich/billerbook"
DL = REPO + "/releases/latest"
VERSION = "0.10"
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
   ("w7", "Crop without the fiddling", "Drag inside a frame to move the photo, scroll to zoom. F toggles between filling the frame and showing the whole photo. V makes it a full-bleed page. Billerbook finds the subject of each photo, so automatic crops keep faces and horizons in view.", "app-editor.webp", None),
   ("w5", "Keyboard first", "Space cycles through arrangements of the photos already on the page. Number keys pick a layout with that many photos. Cmd+D duplicates a page.", None, "keys"),
   ("w5", "Ask your AI to build the book", "Billerbook includes an MCP server with 35 tools. Claude or another assistant can read a folder, choose the print shop and paper, lay out the book, render each spread as an image and change the ones that don't work. You check the result in the app.", None, "prompt"),
   ("w7", "Your print shop, its rules", "Pick Blurb, Amazon KDP, Lulu, IngramSpark, Mixam, Saal Digital, PrestoPhoto or WIRmachenDRUCK, then format and paper. The spine width follows from page count and paper, using the printer's own formula or table. For printers that only give it in their calculator, import their cover template and Billerbook reads the exact cover size from it. The interior comes as single pages or as spreads.", "app-printsettings.webp", None),
   ("w6", "In the book, and visible in Lightroom", "Billerbook reads your Lightroom Classic catalog and never writes to it. The optional plug-in keeps a collection per edition in Lightroom, plus one with the photos that are still missing. Books from Lightroom's Book module import with their pages.", "app-overview.webp", None),
   ("w6", "Everything the Book module does", "Duplicate pages, copy a layout to the next page or to every page with the same number of photos, save your own layouts, set a background photo with opacity, change margin and gap on one page, hide a page number.", "app-pagetools.webp", None),
   ("w6", "Cover with a real spine", "The cover is sized from page count and paper, including spine width, turn-in and hinge. Billerbook sets the title and spine text, and you can change both. Preflight warns about low resolution, the glue zone, page limits and an estimated spine before you pay.", "app-cover.webp", None),
  ],
  klabels=["Cropping", "Keyboard", "AI assistants", "Print shops", "Lightroom Classic", "Pages", "Cover"],
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
  pr_eyebrow="Print shops", pr_h="Eight print shops built in. <span class='hl'>Any other</span> in two minutes.",
  pr_lead="Billerbook writes standard print PDFs with trim and bleed boxes, embedded output intent and images at full resolution. A print profile holds what differs between shops. For a shop that is not listed, import its cover template or enter its numbers once and export them as a profile.",
  spec=[("Bleed", "3 mm"), ("Safety margin", "5 mm"), ("Glue zone, hardcover", "7 mm"), ("Cover", "spine from page count"), ("Colour", "RGB or CMYK + ICC"), ("Profiles", "WIRmachenDRUCK, custom")],
  spec_note="The values above come from the WIRmachenDRUCK profile, checked against the shop's data sheets and real printed books. The custom profile lets you set every number for another shop.",
  shops_label="Built-in print profiles", shops_slug="print-shops", shops_more="Specs, sources and formats for every print shop →",
  shops_title="Print shops supported by Billerbook: Blurb, Amazon KDP, Lulu, IngramSpark, Mixam, Saal Digital and more",
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
       ("Which other print shops work?", "Any shop that takes print PDFs. Built in are also WIRmachenDRUCK, Saal Digital, Mixam, IngramSpark and PrestoPhoto. For others you import the shop's cover template, or enter bleed, margins and cover numbers once and export them as a profile."),
       ("How does Billerbook know the spine width?", "From the printer: its formula or table for the paper and page count where it publishes one, otherwise from the cover template you download from the printer, or the value you enter. Until then Billerbook shows an estimate, marks it as one and warns before export."),
       ("Can I see in Lightroom which photos are in the book?", "Yes, with the Lightroom Classic plug-in. It keeps a collection per edition under Billerbook in the Collections panel, and a second one with the photos from your Lightroom selection that are not in that edition yet."),
       ("Does it run on Windows or Linux?", "The download is a Mac app. The editor itself is a local web app written in Node.js, so it also runs on Windows and Linux from source. Instructions are in the README."),
       ("Do I need Lightroom?", "No. A folder of JPEGs is enough. Lightroom Classic support is there for people who already select their photos there."),
       ("Do my photos leave my computer?", "No. Everything runs locally. The app only goes online to check for updates."),
       ("How do updates work?", "The Mac app checks GitHub releases and installs new versions after you confirm.")],
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
   ("w7", "Zuschneiden ohne Gefummel", "Im Rahmen ziehen verschiebt das Foto, Scrollen zoomt. F wechselt zwischen randfüllend und ganzem Foto. V macht daraus eine randlose Seite. Billerbook erkennt das Motiv jedes Fotos, damit automatische Ausschnitte Gesichter und Horizonte im Bild behalten.", "app-editor.webp", None),
   ("w5", "Tastatur zuerst", "Die Leertaste blättert durch Anordnungen der Fotos auf der Seite. Zifferntasten wählen ein Layout mit so vielen Fotos. Cmd+D dupliziert eine Seite.", None, "keys"),
   ("w5", "Lass deine KI das Buch bauen", "Billerbook bringt einen MCP-Server mit 35 Werkzeugen mit. Claude oder ein anderer Assistent liest einen Ordner, wählt Druckerei und Papier, legt das Buch an, rendert jede Doppelseite als Bild und ändert die, die nicht funktionieren. Du prüfst das Ergebnis in der App.", None, "prompt"),
   ("w7", "Deine Druckerei, ihre Regeln", "Wähle WIRmachenDRUCK, Saal Digital, Blurb, Amazon KDP, Lulu, IngramSpark, Mixam oder PrestoPhoto, dann Format und Papier. Die Rückenbreite folgt aus Seitenzahl und Papier, nach Formel oder Tabelle der Druckerei. Nennt die Druckerei sie nur im eigenen Rechner, importierst du ihre Umschlagvorlage und Billerbook liest das genaue Maß daraus. Den Inhalt gibt es als Einzel- oder Doppelseiten.", "app-printsettings.webp", None),
   ("w6", "Im Buch, und in Lightroom sichtbar", "Billerbook liest deinen Lightroom-Classic-Katalog und schreibt nie hinein. Das Plug-in legt in Lightroom eine Sammlung je Edition an, dazu eine mit den Fotos, die noch fehlen. Bücher aus dem Lightroom-Buch-Modul kommen samt Seiten mit.", "app-overview.webp", None),
   ("w6", "Alles, was das Buch-Modul kann", "Seiten duplizieren, ein Layout auf die nächste Seite oder alle Seiten mit gleich vielen Fotos übertragen, eigene Layouts speichern, Hintergrundfoto mit Deckkraft, Rand und Abstand je Seite, Seitenzahl ausblenden.", "app-pagetools.webp", None),
   ("w6", "Umschlag mit echtem Buchrücken", "Der Umschlag wird aus Seitenzahl und Papier berechnet, mit Rückenbreite, Einschlag und Falz. Billerbook setzt Titel und Rückentext, du kannst beides ändern. Die Prüfung meldet zu geringe Auflösung, die Klebezone, Seitengrenzen und einen geschätzten Rücken, bevor du bezahlst.", "app-cover.webp", None),
  ],
  klabels=["Zuschnitt", "Tastatur", "KI-Assistenten", "Druckereien", "Lightroom Classic", "Seiten", "Umschlag"],
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
  pr_eyebrow="Druckereien", pr_h="Acht Druckereien eingebaut. <span class='hl'>Jede andere</span> in zwei Minuten.",
  pr_lead="Billerbook schreibt normale Druck-PDFs mit Endformat- und Beschnittrahmen, eingebettetem Ausgabeprofil und Bildern in voller Auflösung. Was sich zwischen Druckereien unterscheidet, steht im Druckprofil. Für eine Druckerei, die fehlt, importierst du ihre Umschlagvorlage oder trägst ihre Werte einmal ein und exportierst sie als Profil.",
  spec=[("Beschnitt", "3 mm"), ("Sicherheitsabstand", "5 mm"), ("Klebezone Hardcover", "7 mm"), ("Umschlag", "Rücken aus Seitenzahl"), ("Farbe", "RGB oder CMYK + ICC"), ("Profile", "WIRmachenDRUCK, frei")],
  spec_note="Die Werte oben stammen aus dem Profil für WIRmachenDRUCK, abgeglichen mit den Datenblättern der Druckerei und echten gedruckten Büchern. Im freien Profil stellst du jeden Wert für eine andere Druckerei ein.",
  shops_label="Eingebaute Druckprofile", shops_slug="druckereien", shops_more="Daten, Quellen und Formate jeder Druckerei →",
  shops_title="Druckereien in Billerbook: WIRmachenDRUCK, Saal Digital, Blurb, Amazon KDP, Lulu, Mixam und mehr",
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
       ("Woher kennt Billerbook die Rückenbreite?", "Von der Druckerei: aus ihrer Formel oder Tabelle für Papier und Seitenzahl, wo sie eine veröffentlicht, sonst aus ihrer Umschlagvorlage oder aus dem Wert, den du einträgst. Bis dahin zeigt Billerbook eine Schätzung, kennzeichnet sie und warnt vor dem Export."),
       ("Sehe ich in Lightroom, welche Fotos im Buch sind?", "Ja, mit dem Plug-in für Lightroom Classic. Es pflegt im Bedienfeld Sammlungen unter Billerbook eine Sammlung je Edition und eine zweite mit den Fotos deiner Lightroom-Auswahl, die in dieser Edition noch fehlen."),
       ("Läuft es unter Windows oder Linux?", "Zum Download gibt es eine Mac-App. Der Editor selbst ist eine lokale Web-App in Node.js und läuft aus dem Quellcode auch unter Windows und Linux. Die Anleitung steht im README."),
       ("Brauche ich Lightroom?", "Nein. Ein Ordner mit JPEGs reicht. Die Lightroom-Classic-Anbindung ist für alle, die ihre Fotos ohnehin dort auswählen."),
       ("Verlassen meine Fotos den Rechner?", "Nein. Alles läuft lokal. Online geht die App nur, um nach Updates zu sehen."),
       ("Wie kommen Updates?", "Die Mac-App prüft die GitHub-Releases und installiert neue Versionen, wenn du zustimmst.")],
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
        return b['papers'][0]['spine']
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

def shops_page(t):
    root = "../../" if t["path"] else "../"
    lang = t['lang']
    url = BASE + t['path'] + t['shops_slug'] + '/'
    other_slug = ('druckereien' if lang == 'en' else 'print-shops')
    en_url = BASE + 'print-shops/'; de_url = BASE + 'de/druckereien/'
    out = [head(t, t['shops_title'], t['shops_desc'], url, en_url, de_url, root, ld=shops_ld(t, url)), nav(t, root, '../')]
    out.append(f'<main class="wrap legal shops-page"><p class="label red">Billerbook</p><h1>{esc(t["shops_h1"])}</h1><p class="lead">{esc(t["shops_intro"])}</p>')
    for sh in SHOPS:
        out.append(f'<section class="shop" id="{sh["id"]}"><h2>{esc(sh["name"])}</h2><p class="muted">{esc(sh["region"])}{" · " + "<a href=\"" + sh["url"] + "\">" + esc(sh["url"].replace("https://", "")) + "</a>" if sh.get("url") else ""}</p>')
        out.append(f'<p>{esc(L(sh.get("notes") or {}, lang))}</p>')
        for k, b in sh['bindings'].items():
            cov = b['cover']
            cover = f"{t['lbl_wrap']} {mm(cov['wrap'])}" + (f", {t['lbl_joint']} {mm(cov['joint'])}" if cov.get('joint') else '') + (f", {t['lbl_hinge']} {mm(cov['hinge'])}" if cov.get('hinge') else '')
            pages = b.get('pages') or {}
            pr = ' · '.join(x for x in [f"min {pages['min']}" if pages.get('min') else '', f"max {pages['max']}" if pages.get('max') else '', f"step {pages['step']}" if pages.get('step') else ''] if x) or '–'
            papers = ', '.join(L(x['label'], lang) for x in b.get('papers', []))
            rows = [
                (t['lbl_bleed'], mm(b['bleed'])), (t['lbl_safety'], mm(b['safety'])),
                (t['col'][2], t['interior_names'][b['interior']] + (f", {t['lbl_blank']}" if b.get('blankEnds') else '')),
                (t['lbl_pages'], pr), (t['lbl_colour'], 'sRGB' if b['colour'] == 'srgb' else 'CMYK'),
                (t['col'][3], t['spine_names'][shop_spine(b)]), (t['lbl_cover'], cover),
            ]
            if papers: rows.append((t['lbl_papers'], papers))
            fm = ', '.join(L(f['label'], lang) for f in sh['formats'] if f['binding'] == k)
            rows.append((t['lbl_formats'], fm))
            out.append(f'<h3>{esc(k.capitalize())} <span class="tag">{esc(t["status_names"].get(b["status"], b["status"]))}</span></h3><table class="spec"><tbody>' + ''.join(f'<tr><td>{esc(a)}</td><td>{esc(v)}</td></tr>' for a, v in rows) + '</tbody></table>')
        src = ' '.join(f'<a href="{esc(u)}" rel="nofollow noopener">[{i+1}]</a>' for i, u in enumerate(sh['sources']))
        out.append(f'<p class="note">{esc(t["lbl_sources"])}: {src} · {esc(t["lbl_checked"])} {esc(sh.get("checked", ""))}</p></section>')
    out.append(f'<p class="lead">{esc(t["lbl_any"])}</p></main>')
    out.append(footer(t, root))
    return '\n'.join(out)

def app_ld(t, url):
    en = t['lang'] == 'en'
    data = [{
        "@context": "https://schema.org", "@type": "SoftwareApplication", "name": "Billerbook",
        "url": BASE, "downloadUrl": DL, "softwareVersion": VERSION, "operatingSystem": "macOS 12 or later",
        "applicationCategory": "DesignApplication", "applicationSubCategory": "Photo book layout",
        "description": t['desc'], "inLanguage": ["en", "de"], "license": "https://www.gnu.org/licenses/agpl-3.0.html",
        "isAccessibleForFree": True, "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"},
        "image": BASE + "assets/img/og.jpg", "screenshot": [BASE + "assets/img/app-editor.webp", BASE + "assets/img/app-printsettings.webp"],
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

def head(t, title, desc, canonical, alt_en, alt_de, root, ld=None):
    return f"""<!doctype html>
<html lang="{t['lang']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canonical}">
<link rel="alternate" hreflang="en" href="{alt_en}">
<link rel="alternate" hreflang="de" href="{alt_de}">
<link rel="alternate" hreflang="x-default" href="{alt_en}">
<meta name="theme-color" content="#f5f0e6">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{BASE}assets/img/og.jpg">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="{root}assets/img/favicon.png">
<link rel="apple-touch-icon" href="{root}assets/img/apple-touch-icon.png">
<link rel="preload" href="{root}assets/fonts/archivo.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{root}assets/site.css">
{"".join('<script type="application/ld+json">' + _json.dumps(x, ensure_ascii=False).replace("</", "<\\/") + '</script>' for x in (ld or []))}
</head>
<body>"""

def nav(t, root, home="./"):
    ids = ["features", "editions", "print", "faq"]
    links = "".join(f'<a class="l hide-s" href="{home}#{i}">{esc(n)}</a>' for i, n in zip(ids, t["nav"]))
    other = 'de' if t['lang'] == 'en' else 'en'
    return f"""<header class="nav"><div class="wrap">
<a class="brand" href="{home}"><img src="{root}assets/img/icon.png" alt="" width="28" height="28">Billerbook</a>
{links}<a class="l" href="{t['other']}" hreflang="{other}" lang="{other}">{t['other_label']}</a>
<a class="btn btn-red btn-sm" href="{DL}">{esc(t['dl_short'])}{DOWN}</a>
</div></header>"""

def footer(t, root):
    return f"""<footer><div class="wrap row">
<p class="m0">{t['foot_by']} AGPL-3.0.</p>
<nav><a href="{REPO}">{t['source']}</a><a href="{root}{t['path']}impressum.html">{t['imprint']}</a><a href="{root}{t['path']}datenschutz.html">{t['privacy']}</a><a href="{t['other']}">{t['other_label']}</a></nav>
</div></footer>
<script>
document.documentElement.classList.add('js');
const io=new IntersectionObserver(es=>es.forEach(e=>{{if(e.isIntersecting){{e.target.classList.add('in');io.unobserve(e.target)}}}}),{{rootMargin:'0px 0px -6% 0px'}});
document.querySelectorAll('.rv').forEach(el=>io.observe(el));
</script>
</body></html>"""

def img(root, name, alt, w, h, lazy=True):
    return f'<img src="{root}assets/img/{name}" alt="{esc(alt)}" width="{w}" height="{h}"{" loading=\"lazy\"" if lazy else ""} decoding="async">'

def proof(inner, cap="", cls=""):
    c = f'<figcaption>{cap}</figcaption>' if cap else ""
    return f'<figure class="proof m0 {cls}"><span class="cm"></span>{inner}{c}</figure>'

REG = '<div class="wrap reg" aria-hidden="true"><i></i><i></i><i></i><i></i><span></span><em>Billerbook</em></div>'

def page(t):
    root = "../" if t["path"] else ""
    en = t["lang"] == "en"
    out = [head(t, t["title"], t["desc"], BASE + t["path"], BASE, BASE + "de/", root, ld=app_ld(t, BASE + t["path"])), nav(t, root)]
    out.append(f"""<main>
<section class="hero" aria-labelledby="h1"><div class="wrap">
<div class="top">
<div><p class="label red rv">{t['eyebrow']}</p><h1 id="h1" class="rv d1 h1">{t['h1']}</h1></div>
<div class="side"><p class="lead rv d2">{t['lead']}</p>
<div class="ctas rv d2"><a class="btn btn-red" href="{DL}">{t['dl']}{DOWN}</a><a class="btn btn-line ext" href="{REPO}">{t['gh']}{ARROW}</a></div>
<p class="meta rv d3">{t['meta']}</p></div>
</div>
<div class="shot"><div class="row">
{proof(img(root, "app-editor.webp", "The Billerbook editor: photo pool, spread with crop marks, layouts and preflight" if en else "Der Billerbook-Editor: Fotobestand, Doppelseite, Layouts und Prüfung", 2000, 1250, lazy=False), t['hero_caps'][0], "rv d2")}
{proof(img(root, "sc-spread-2.webp", "Portrait softcover spread with the same photos" if en else "Softcover-Doppelseite hochkant mit denselben Fotos", 1400, 990, lazy=False), t['hero_caps'][1], "rv d3")}
</div></div>
</div></section>
{REG}
<div class="wrap story">
<div class="label rv">{t["story_num"]}</div>
<div>{"".join(f'<p class="rv">{p}</p>' for p in t['story'])}</div>
</div>

<section id="features" class="dark"><div class="wrap">
<div class="head"><div><span class="label rv">{t['feat_eyebrow']}</span><h2 class="rv d1">{t['feat_h']}</h2></div><p class="lead rv d2">{t['feat_lead']}</p></div>""")
    cards = t["cards"]; labels = t["klabels"]
    shots = [i for i, c in enumerate(cards) if c[3]]
    for n, i in enumerate(shots):
        _, h3, p, shot, _ = cards[i]
        flip = " flip" if n % 2 else ""
        out.append(f'<div class="feat{flip}"><div class="txt rv"><span class="k">{esc(labels[i])}</span><h3>{esc(h3)}</h3><p>{esc(p)}</p></div>{proof(img(root, shot, h3, 1600, 1000), "", "rv d1")}</div>')
    kc = cards[1]; ac = cards[2]
    keys = "".join(f"<kbd>{esc(k)}</kbd><span>{esc(v)}</span>" for k, v in t["keys"])
    you, bot = t["prompt"].split("\n", 1)
    def bubble(x, cls):
        lab, txt = x.split("</b>", 1)
        return f'<p class="{cls}"><b>{lab.replace("<b>","").rstrip(":")}</b>{txt.strip()}</p>'
    out.append(f"""<div class="pair">
<div class="rv"><span class="k kb">{esc(labels[1])}</span><h3>{esc(kc[1])}</h3><p>{esc(kc[2])}</p><div class="keys">{keys}</div></div>
<div class="rv d1"><span class="k kb">{esc(labels[2])}</span><h3>{esc(ac[1])}</h3><p>{esc(ac[2])}</p><div class="chat">{bubble(you, "you")}{bubble(bot, "")}</div></div>
</div>
</div></section>

<section id="editions"><div class="wrap">
<div class="head"><div><span class="label rv">{t['ed_eyebrow']}</span><h2 class="rv d1">{t['ed_h']}</h2></div><p class="lead rv d2">{t['ed_lead']}</p></div>
<div class="editions">
{proof(img(root, "hc-spread-1.webp", "Hardcover spread" if en else "Hardcover-Doppelseite", 2000, 707), t['ed_caps'][0], "rv")}
{proof(img(root, "sc-spread-1.webp", "Softcover spread" if en else "Softcover-Doppelseite", 1400, 990), t['ed_caps'][1], "rv d1")}
</div></div></section>
{REG}
<section><div class="wrap">
<div class="head"><div><span class="label rv">{t['how_eyebrow']}</span><h2 class="rv d1">{t['how_h']}</h2></div></div>
<ol class="steps">{"".join(f'<li class="rv d{i%3}"><h3>{esc(a)}</h3><p>{esc(b)}</p></li>' for i,(a,b) in enumerate(t['steps']))}</ol>
</div></section>

<section id="print"><div class="wrap print">
<div><span class="label rv">{t['pr_eyebrow']}</span><h2 class="rv d1 prh">{t['pr_h']}</h2><p class="lead rv d2">{t['pr_lead']}</p></div>
<div class="ticket rv d1"><span class="label">{t['shops_label']}</span><table class="spec shops"><tbody>{shop_rows(t)}</tbody></table><p class="note"><a href="{root}{t['path']}{t['shops_slug']}/">{esc(t['shops_more'])}</a></p></div>
</div></section>

<section id="faq"><div class="wrap faq">
<h2 class="rv">{t['faq_h']}</h2>
<div class="rv d1">{"".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q,a in t['faq'])}</div>
</div></section>

<section class="final"><div class="wrap">
<h2 class="rv">{t['final_h']}</h2>
<div class="ctas rv d1"><a class="btn btn-paper" href="{DL}">{t['dl']}{DOWN}</a><a class="btn btn-ghost ext" href="{REPO}">{t['gh']}{ARROW}</a></div>
</div></section>
</main>""")
    out.append(footer(t, root))
    return "\n".join(out)

def legal_pages(mail):
    m = f'<a href="mailto:{mail}">{mail}</a>' if mail else 'siehe <a href="https://tillheidrich.de/impressum/">Impressum auf tillheidrich.de</a>'
    return {
 "impressum": ("Impressum", f'''<p><strong>Angaben gemäß § 5 DDG</strong></p>
<p>Till Heidrich – Content Creation<br>Rotdornweg 17<br>21255 Tostedt<br>Deutschland</p>
<h2>Kontakt</h2><p>E-Mail: {m}</p>
<h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2><p>Till Heidrich, Anschrift wie oben</p>
<h2>Umsatzsteuer</h2><p>Kleinunternehmer gemäß § 19 UStG, daher keine Umsatzsteuer-Identifikationsnummer.</p>
<h2>Software</h2><p>Billerbook ist freie Software unter der GNU Affero General Public License 3.0 und wird, soweit gesetzlich zulässig, ohne Gewährleistung bereitgestellt. Der Quellcode liegt auf <a href="{REPO}">GitHub</a>.</p>
<h2>Haftung für Links</h2><p>Diese Seite verlinkt auf externe Seiten (GitHub). Für deren Inhalte sind die jeweiligen Anbieter verantwortlich.</p>'''),
 "datenschutz": ("Datenschutz", f'''<p>Diese Website setzt keine Cookies, nutzt keine Analyse- oder Tracking-Dienste und bindet keine Inhalte von Drittanbietern ein. Schriften und Bilder liegen auf demselben Server.</p>
<h2>Verantwortlicher</h2><p>Till Heidrich – Content Creation, Rotdornweg 17, 21255 Tostedt, {m}</p>
<h2>Hosting und Server-Logfiles</h2><p>Die Seite liegt auf einem Server der Hetzner Online GmbH in Deutschland. Beim Aufruf verarbeitet der Webserver technisch notwendige Daten (IP-Adresse, Zeitpunkt, aufgerufene Datei, Browserkennung), um die Seite auszuliefern und gegen Missbrauch zu schützen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Die Logs werden nach kurzer Zeit gelöscht. Mit Hetzner besteht ein Vertrag zur Auftragsverarbeitung.</p>
<h2>Downloads über GitHub</h2><p>Der Download-Knopf führt zu GitHub (GitHub, Inc., USA). Dort gelten die Datenschutzbestimmungen von GitHub. Erst mit dem Klick werden Daten an GitHub übertragen.</p>
<h2>Die App</h2><p>Billerbook läuft lokal auf deinem Rechner. Fotos, Kataloge und Projekte werden nicht hochgeladen. Die Mac-App fragt bei GitHub nach neuen Versionen; dabei sieht GitHub deine IP-Adresse.</p>
<h2>Deine Rechte</h2><p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch und Datenübertragbarkeit sowie das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, etwa bei der Landesbeauftragten für den Datenschutz Niedersachsen.</p>'''),
    }

EN_NOTE = '<p class="muted">This page is in German because German law requires it.</p>'

def legal(t, key, pages):
    title, body = pages[key]
    root = "../" if t["path"] else ""
    note = EN_NOTE if t["lang"] == "en" else ""
    return "\n".join([head(t, f"{title} · Billerbook", title, BASE + t["path"] + key + ".html", BASE + key + ".html", BASE + "de/" + key + ".html", root),
                      nav(t, root), f'<main class="wrap legal"><h1>{title}</h1>{note}{body}</main>', footer(t, root)])

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
             "- MCP server with 35 tools for Claude and other AI assistants.",
             "", "## Built-in print profiles"]
    for sh in SHOPS:
        st = ", ".join(f"{k}: {b['status']}" for k, b in sh["bindings"].items())
        lines.append(f"- {sh['name']} ({sh['region']}): {st}. Sources: " + " ".join(sh["sources"]))
    lines += ["", "## Links", f"- Download: {DL}", f"- Source code: {REPO}", f"- Print shop details: {BASE}print-shops/", f"- MCP documentation: {REPO}/blob/main/docs/mcp.md", f"- Print profile format: {REPO}/blob/main/docs/print-profiles.md", ""]
    for q, a in t["faq"]:
        lines += [f"### {q}", a, ""]
    return "\n".join(lines)

def main():
    mail = os.environ.get("CONTACT_EMAIL", "").strip()
    pages = legal_pages(html.escape(mail) if mail else None)
    if not mail:
        print("warning: CONTACT_EMAIL not set, imprint links to the operator's main imprint for e-mail contact")
    here = os.path.dirname(os.path.abspath(__file__))
    pub = os.path.join(here, "public")
    if os.path.exists(pub): shutil.rmtree(pub)
    shutil.copytree(os.path.join(here, "assets"), os.path.join(pub, "assets"))
    for t in T.values():
        d = os.path.join(pub, t["path"]); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w").write(page(t))
        for k in pages: open(os.path.join(d, k + ".html"), "w").write(legal(t, k, pages))
        sd = os.path.join(d, t["shops_slug"]); os.makedirs(sd, exist_ok=True)
        open(os.path.join(sd, "index.html"), "w").write(shops_page(t))
    open(os.path.join(pub, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nSitemap: {BASE}sitemap.xml\n")
    urls = ["", "de/", "print-shops/", "de/druckereien/", "impressum.html", "datenschutz.html", "de/impressum.html", "de/datenschutz.html"]
    open(os.path.join(pub, "llms.txt"), "w").write(llms_txt())
    open(os.path.join(pub, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<url><loc>{BASE}{u}</loc></url>" for u in urls) + "</urlset>\n")
    print("built", pub)

if __name__ == "__main__": main()
