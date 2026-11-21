#!/usr/bin/env python3
"""Generates the Billerbook marketing site (English at /, German at /de/).
Edit the copy in T below, run `CONTACT_EMAIL=... python3 build.py`, commit, push. Coolify serves `public/`.
The contact address for imprint and privacy pages comes from the CONTACT_EMAIL environment variable."""
import os, sys, html, shutil

REPO = "https://github.com/tillheidrich/billerbook"
DL = REPO + "/releases/latest"
VERSION = "0.9"
BASE = "https://billerbook.heidrich-digital.de/"

ARROW = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 12 12 4M6 4h6v6"/></svg>'
DOWN = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v9M4 7l4 4 4-4M3 14h10"/></svg>'

T = {
 "en": dict(
  lang="en", path="", other="/de/", other_label="Deutsch", other_short="DE",
  title="Billerbook: photo book layout for the Mac, with print-ready PDFs",
  desc="Open-source photo book layout for macOS. Drag photos in, crop with one key, export the PDF your print shop wants. Works with Lightroom Classic or any folder.",
  nav=["Features", "Editions", "Print", "FAQ"],
  eyebrow="Free and open source · macOS",
  h1="Lay out photo books <em>fast.</em> Print them anywhere.",
  lead="Billerbook is a photo book editor for the Mac. Drop in a folder or a Lightroom collection, flip through layouts with the space bar, and export a PDF with bleed, spine and cover that a print shop accepts on the first upload.",
  dl="Download for Mac", dl_short="Download", gh="View on GitHub",
  meta=f"Version {VERSION} · Apple silicon and Intel · AGPL-3.0",
  facts=[("1 key", "switches a photo between full page and fitted"), ("2 editions", "or more from the same photos, each with its own format"), ("0 accounts", "no cloud, no upload, no tracking")],
  story_num="Why it exists",
  story=["Every year I made a family photo book the same way. <strong>Pick the photos in Lightroom, lay them out in the Book module, export, then repair the PDF in InDesign</strong> until the print shop stopped complaining about bleed.",
         "Then a portrait softcover for the relatives, with fewer pages. <strong>Which meant doing most of it again.</strong> Cropping a photo to fill a page, or back, took far too many clicks.",
         "Billerbook is the tool I wanted instead. It runs on your Mac, keeps your originals where they are, and knows what a print PDF has to look like."],
  feat_eyebrow="What it does", feat_h="Fast where layout usually gets <em>slow.</em>",
  feat_lead="The parts that cost the most time in other tools are single keystrokes here.",
  cards=[
   ("w7", "Crop without the fiddling", "Drag inside a frame to move the photo, scroll to zoom. F toggles between filling the frame and showing the whole photo. V makes it a full-bleed page. Billerbook finds the subject of each photo, so automatic crops keep faces and horizons in view.", "edit.webp", None),
   ("w5", "Keyboard first", "Space cycles through arrangements of the photos already on the page. Number keys pick a layout with that many photos.", None, "keys"),
   ("w5", "Ask your AI to build the book", "Billerbook includes an MCP server. Claude or another assistant can read a folder, lay out the book, look at each spread and fix what it doesn't like. You check the result in the app.", None, "prompt"),
   ("w7", "Your Lightroom selection, always in view", "Point Billerbook at your Lightroom Classic catalog and pick a collection. Every photo shows whether it is already in the book, and in which edition. Books you started in Lightroom's Book module import with their pages. The catalog is only read, never written.", "spread.webp", None),
   ("w6", "Preflight before you pay", "Low resolution, photos in the glue zone, empty frames, missing files and a wrong page count show up in a list. Click an entry to jump to the spread.", "overview.webp", None),
   ("w6", "Cover with a real spine", "The cover is sized from page count and paper, including spine width, turn-in and hinge. Title and spine text are set for you and stay editable.", "cover.webp", None),
  ],
  keys=[("Space", "next arrangement"), ("F", "fill ⇄ fit"), ("V", "full bleed"), ("1–9", "photos per page"), ("⌘Z", "undo")],
  prompt='<b>You:</b> Make a 60-page landscape book from ~/Pictures/Iceland 2026. Keep the 5-star shots on their own pages.\n<b>Assistant:</b> Created edition "Hardcover", 60 pages, 142 photos. Spread 14 had two horizon shots stacked; switched it to a full-bleed pair. Preflight is clean.',
  ed_eyebrow="Editions", ed_h="One set of photos. <em>As many books</em> as you need.",
  ed_lead="A detailed landscape hardcover for yourself and a shorter portrait softcover for the family can share the same photo pool. Each edition has its own format, page count and layouts. Layouts adapt when the format changes.",
  ed_caps=["<b>Hardcover, landscape.</b> 297 × 210 mm, the long version.", "<b>Softcover, portrait.</b> 210 × 297 mm, fewer pages, same photos."],
  how_eyebrow="How it works", how_h="From folder to print shop in four steps.",
  steps=[("Add photos", "Drag in a folder, pick a Lightroom collection, or let your AI assistant do it."),
         ("Pick a format", "Choose a print profile and a size. Bleed, safety margin and glue zone come with it."),
         ("Lay out", "Auto-fill gives you a first draft. Then change spreads with keys, drag and drop."),
         ("Export", "Interior and cover as separate PDFs, RGB or CMYK with an ICC profile, ready to upload.")],
  pr_eyebrow="Print", pr_h="PDFs that <em>pass</em> the upload check.",
  pr_lead="Billerbook writes standard print PDFs with trim and bleed boxes, embedded output intent and images at full resolution. Any print shop that accepts PDF uploads can print them. Print profiles hold what differs between shops.",
  spec=[("Bleed", "3 mm"), ("Safety margin", "5 mm"), ("Glue zone, hardcover", "7 mm"), ("Cover", "spine from page count"), ("Colour", "RGB or CMYK + ICC"), ("Profiles", "WIRmachenDRUCK, custom")],
  spec_note="Values shown: the WIRmachenDRUCK profile, checked against the shop's data sheets and real printed books. The custom profile lets you set every number for another shop.",
  faq_h="Questions",
  faq=[("Is it really free?", "Yes. Billerbook is open source under the AGPL-3.0 licence. There is no paid tier, no account and no trial."),
       ("Does it run on Windows or Linux?", "The download is a Mac app. The editor itself is a local web app written in Node.js, so it also runs on Windows and Linux from source. Instructions are in the README."),
       ("Which print shops does it work with?", "Any shop that takes print PDFs. WIRmachenDRUCK has a ready profile. For other shops you enter bleed, margins and cover numbers from their specification once. Send a profile with a link to the shop's data sheet and it goes into the next release."),
       ("Do I need Lightroom?", "No. A folder of JPEGs is enough. Lightroom Classic support is there for people who already select their photos there."),
       ("Will it change my Lightroom catalog?", "No. Billerbook opens the catalog read-only and, if Lightroom has it locked, reads a copy. Your originals are never modified either."),
       ("Do my photos leave my computer?", "No. Everything runs locally. The app only goes online to check for updates."),
       ("How do updates work?", "The Mac app checks GitHub releases and installs new versions after you confirm.")],
  final_h="Your next photo book starts with a folder.",
  foot_by='Made by <a href="https://tillheidrich.de">Till Heidrich</a> in Tostedt, Germany.',
  imprint="Imprint", privacy="Privacy", source="Source code",
 ),
 "de": dict(
  lang="de", path="de/", other="/", other_label="English", other_short="EN",
  title="Billerbook: Fotobücher am Mac layouten, druckfertige PDFs",
  desc="Kostenlose Open-Source-App für Fotobuch-Layouts am Mac. Fotos reinziehen, mit einer Taste zuschneiden, das PDF exportieren, das deine Druckerei haben will. Mit Lightroom Classic oder jedem Ordner.",
  nav=["Funktionen", "Editionen", "Druck", "FAQ"],
  eyebrow="Kostenlos und Open Source · macOS",
  h1="Fotobücher <em>schnell</em> gestalten. Überall drucken.",
  lead="Billerbook ist ein Fotobuch-Editor für den Mac. Ordner oder Lightroom-Sammlung reinziehen, mit der Leertaste durch Layouts blättern und ein PDF mit Beschnitt, Buchrücken und Umschlag exportieren, das die Druckerei beim ersten Hochladen annimmt.",
  dl="Für Mac laden", dl_short="Laden", gh="Auf GitHub ansehen",
  meta=f"Version {VERSION} · Apple Silicon und Intel · AGPL-3.0",
  facts=[("1 Taste", "macht aus einem Foto eine volle Seite und zurück"), ("2 Editionen", "oder mehr aus denselben Fotos, jede im eigenen Format"), ("0 Konten", "keine Cloud, kein Upload, kein Tracking")],
  story_num="Warum es das gibt",
  story=["Jedes Jahr habe ich unser Familien-Fotobuch gleich gebaut. <strong>Fotos in Lightroom auswählen, im Buch-Modul layouten, exportieren und das PDF in InDesign reparieren</strong>, bis die Druckerei nicht mehr über den Beschnitt meckerte.",
         "Dann noch ein Softcover hochkant für die Verwandtschaft, mit weniger Seiten. <strong>Also das meiste noch einmal.</strong> Ein Foto auf die ganze Seite ziehen oder zurück kostete jedes Mal viel zu viele Klicks.",
         "Billerbook ist das Werkzeug, das ich stattdessen haben wollte. Es läuft auf deinem Mac, lässt die Originale, wo sie sind, und weiß, wie ein Druck-PDF aussehen muss."],
  feat_eyebrow="Was es kann", feat_h="Schnell, wo Layout sonst <em>zäh</em> wird.",
  feat_lead="Was in anderen Programmen am meisten Zeit kostet, ist hier ein Tastendruck.",
  cards=[
   ("w7", "Zuschneiden ohne Gefummel", "Im Rahmen ziehen verschiebt das Foto, Scrollen zoomt. F wechselt zwischen randfüllend und ganzem Foto. V macht daraus eine randlose Seite. Billerbook erkennt das Motiv jedes Fotos, damit automatische Ausschnitte Gesichter und Horizonte im Bild behalten.", "edit.webp", None),
   ("w5", "Tastatur zuerst", "Die Leertaste blättert durch Anordnungen der Fotos auf der Seite. Zifferntasten wählen ein Layout mit so vielen Fotos.", None, "keys"),
   ("w5", "Lass deine KI das Buch bauen", "Billerbook bringt einen MCP-Server mit. Claude oder ein anderer Assistent liest einen Ordner, legt das Buch an, schaut sich jede Doppelseite an und korrigiert, was nicht passt. Du prüfst das Ergebnis in der App.", None, "prompt"),
   ("w7", "Deine Lightroom-Auswahl immer im Blick", "Billerbook liest deinen Lightroom-Classic-Katalog. Du wählst eine Sammlung und siehst bei jedem Foto, ob es schon im Buch ist und in welcher Edition. Bücher aus dem Lightroom-Buch-Modul kommen samt Seiten mit. Der Katalog wird nur gelesen, nie verändert.", "spread.webp", None),
   ("w6", "Prüfen, bevor du bezahlst", "Zu geringe Auflösung, Fotos in der Klebezone, leere Rahmen, fehlende Dateien und eine falsche Seitenzahl stehen in einer Liste. Ein Klick springt zur Doppelseite.", "overview.webp", None),
   ("w6", "Umschlag mit echtem Buchrücken", "Der Umschlag wird aus Seitenzahl und Papier berechnet, mit Rückenbreite, Einschlag und Falz. Titel und Rückentext sind gesetzt und bleiben änderbar.", "cover.webp", None),
  ],
  keys=[("Leertaste", "nächste Anordnung"), ("F", "füllen ⇄ ganz"), ("V", "randlos"), ("1–9", "Fotos pro Seite"), ("⌘Z", "zurück")],
  prompt='<b>Du:</b> Mach ein Querformat-Buch mit 60 Seiten aus ~/Bilder/Island 2026. Die 5-Sterne-Fotos bekommen eigene Seiten.\n<b>Assistent:</b> Edition „Hardcover“ angelegt, 60 Seiten, 142 Fotos. Auf Doppelseite 14 lagen zwei Horizontfotos übereinander, jetzt randlos nebeneinander. Die Prüfung ist sauber.',
  ed_eyebrow="Editionen", ed_h="Ein Fotobestand. <em>So viele Bücher,</em> wie du brauchst.",
  ed_lead="Ein ausführliches Hardcover quer für dich und ein kürzeres Softcover hochkant für die Familie teilen sich dieselben Fotos. Jede Edition hat ihr eigenes Format, ihre Seitenzahl und ihre Layouts. Beim Formatwechsel passen sich die Layouts an.",
  ed_caps=["<b>Hardcover quer.</b> 297 × 210 mm, die lange Fassung.", "<b>Softcover hochkant.</b> 210 × 297 mm, weniger Seiten, dieselben Fotos."],
  how_eyebrow="So geht's", how_h="Vom Ordner zur Druckerei in vier Schritten.",
  steps=[("Fotos holen", "Ordner reinziehen, Lightroom-Sammlung wählen oder den KI-Assistenten machen lassen."),
         ("Format wählen", "Druckprofil und Größe aussuchen. Beschnitt, Sicherheitsabstand und Klebezone kommen mit."),
         ("Gestalten", "Automatisch füllen ergibt einen ersten Entwurf. Danach Doppelseiten mit Tasten und Drag & Drop ändern."),
         ("Exportieren", "Inhalt und Umschlag als getrennte PDFs, RGB oder CMYK mit ICC-Profil, fertig zum Hochladen.")],
  pr_eyebrow="Druck", pr_h="PDFs, die den Upload-Check <em>bestehen.</em>",
  pr_lead="Billerbook schreibt normale Druck-PDFs mit Endformat- und Beschnittrahmen, eingebettetem Ausgabeprofil und Bildern in voller Auflösung. Jede Druckerei, die PDF-Uploads annimmt, kann sie drucken. Was sich zwischen Druckereien unterscheidet, steht im Druckprofil.",
  spec=[("Beschnitt", "3 mm"), ("Sicherheitsabstand", "5 mm"), ("Klebezone Hardcover", "7 mm"), ("Umschlag", "Rücken aus Seitenzahl"), ("Farbe", "RGB oder CMYK + ICC"), ("Profile", "WIRmachenDRUCK, frei")],
  spec_note="Gezeigt: das Profil für WIRmachenDRUCK, abgeglichen mit den Datenblättern der Druckerei und echten gedruckten Büchern. Im freien Profil stellst du jeden Wert für eine andere Druckerei ein.",
  faq_h="Fragen",
  faq=[("Ist das wirklich kostenlos?", "Ja. Billerbook ist Open Source unter der AGPL-3.0. Es gibt keine Bezahlversion, kein Konto und keine Testphase."),
       ("Läuft es unter Windows oder Linux?", "Zum Download gibt es eine Mac-App. Der Editor selbst ist eine lokale Web-App in Node.js und läuft aus dem Quellcode auch unter Windows und Linux. Die Anleitung steht im README."),
       ("Mit welchen Druckereien funktioniert es?", "Mit jeder, die Druck-PDFs annimmt. Für WIRmachenDRUCK gibt es ein fertiges Profil. Bei anderen trägst du Beschnitt, Ränder und Umschlagmaße einmal aus deren Datenblatt ein. Schick ein Profil mit Link zum Datenblatt, dann kommt es ins nächste Release."),
       ("Brauche ich Lightroom?", "Nein. Ein Ordner mit JPEGs reicht. Die Lightroom-Classic-Anbindung ist für alle, die ihre Fotos ohnehin dort auswählen."),
       ("Verändert es meinen Lightroom-Katalog?", "Nein. Billerbook öffnet den Katalog nur lesend und liest eine Kopie, wenn Lightroom ihn gesperrt hat. Auch deine Originale bleiben unverändert."),
       ("Verlassen meine Fotos den Rechner?", "Nein. Alles läuft lokal. Online geht die App nur, um nach Updates zu sehen."),
       ("Wie kommen Updates?", "Die Mac-App prüft die GitHub-Releases und installiert neue Versionen, wenn du zustimmst.")],
  final_h="Dein nächstes Fotobuch fängt mit einem Ordner an.",
  foot_by='Gebaut von <a href="https://tillheidrich.de">Till Heidrich</a> in Tostedt.',
  imprint="Impressum", privacy="Datenschutz", source="Quellcode",
 ),
}

def esc(s): return html.escape(s, quote=True)

def head(t, title, desc, canonical, alt_en, alt_de, root):
    return f'''<!doctype html>
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
<meta name="theme-color" content="#1c1814">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:image" content="{BASE}assets/img/og.jpg">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="{root}assets/img/favicon.png">
<link rel="apple-touch-icon" href="{root}assets/img/apple-touch-icon.png">
<link rel="preload" href="{root}assets/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{root}assets/site.css">
</head>
<body>'''

def nav(t, root):
    ids = ["features", "editions", "print", "faq"]
    home = "./"
    links = "".join(f'<a class="l hide-s" href="{home}#{i}">{esc(n)}</a>' for i, n in zip(ids, t["nav"]))
    return f'''<nav class="nav" aria-label="Main">
<a class="brand" href="{home}"><img src="{root}assets/img/icon.png" alt="" width="26" height="26">Billerbook</a>
{links}<a class="l lang" href="{t['other']}" hreflang="{'de' if t['lang']=='en' else 'en'}" aria-label="{t['other_label']}">{t['other_short']}</a>
<a class="btn btn-primary btn-sm" href="{DL}">{esc(t['dl_short'])}<span class="ic">{DOWN}</span></a>
</nav>'''

def footer(t, root):
    return f'''<footer><div class="wrap row">
<p class="m0">{t['foot_by']} AGPL-3.0.</p>
<nav><a href="{REPO}">{t['source']}</a><a href="{root}{t['path']}impressum.html">{t['imprint']}</a><a href="{root}{t['path']}datenschutz.html">{t['privacy']}</a><a href="{t['other']}">{t['other_label']}</a></nav>
</div></footer>
<script>
const io=new IntersectionObserver(es=>es.forEach(e=>{{if(e.isIntersecting){{e.target.classList.add('in');io.unobserve(e.target)}}}}),{{rootMargin:'0px 0px -8% 0px'}});
document.querySelectorAll('.rv').forEach(el=>io.observe(el));
</script>
</body></html>'''

def img(root, name, alt, w, h, lazy=True):
    return f'<img src="{root}assets/img/{name}" alt="{esc(alt)}" width="{w}" height="{h}"{" loading=\"lazy\"" if lazy else ""} decoding="async">'

def page(t):
    root = "../" if t["path"] else ""
    en = t["lang"] == "en"
    out = [head(t, t["title"], t["desc"], BASE + t["path"], BASE, BASE + "de/", root), nav(t, root)]
    out.append(f'''<main>
<header class="hero"><div class="wrap grid">
<div class="copy">
<span class="eyebrow rv">{t['eyebrow']}</span>
<h1 class="rv d1">{t['h1']}</h1>
<p class="lead rv d2">{t['lead']}</p>
<div class="ctas rv d3"><a class="btn btn-primary" href="{DL}">{t['dl']}<span class="ic">{DOWN}</span></a><a class="btn btn-ghost" href="{REPO}">{t['gh']}<span class="ic">{ARROW}</span></a></div>
<p class="meta rv d3">{t['meta']}</p>
</div>
<div class="stack rv d2">
<div class="bezel"><div class="core">{img(root, "hc-spread-1.webp", "Photo book spread in Billerbook" if en else "Fotobuch-Doppelseite in Billerbook", 2000, 707, lazy=False)}</div></div>
<div class="bezel back"><div class="core">{img(root, "sc-spread-2.webp", "Portrait softcover spread" if en else "Doppelseite Softcover hochkant", 1400, 990)}</div></div>
</div>
</div></header>
<div class="wrap"><div class="facts rv">{"".join(f"<div><b>{a}</b><span>{b}</span></div>" for a,b in t['facts'])}</div></div>

<section><div class="wrap story">
<div class="num rv">{t['story_num']}</div>
<div>{"".join(f'<p class="rv">{p}</p>' for p in t['story'])}</div>
</div></section>

<section id="features"><div class="wrap">
<div class="sec-head"><div><span class="eyebrow rv">{t['feat_eyebrow']}</span><h2 class="rv d1">{t['feat_h']}</h2></div><p class="lead rv d2">{t['feat_lead']}</p></div>
<div class="bento">''')
    for i, (w, h3, p, shot, extra) in enumerate(t["cards"]):
        inner = f'<div class="txt"><h3>{esc(h3)}</h3><p>{esc(p)}</p></div>'
        if extra == "keys":
            inner += '<div class="keys">' + "".join(f"<kbd>{esc(k)}</kbd><span>{esc(v)}</span>" for k, v in t["keys"]) + "</div>"
        if extra == "prompt":
            inner += f'<pre class="prompt">{t["prompt"]}</pre>'
        if shot:
            inner += f'<div class="shot">{img(root, shot, h3, 1600, 1000)}</div>'
        out.append(f'<article class="card {w} bezel rv d{i%3}"><div class="core">{inner}</div></article>')
    out.append(f'''</div></div></section>

<section id="editions"><div class="wrap">
<div class="sec-head"><div><span class="eyebrow rv">{t['ed_eyebrow']}</span><h2 class="rv d1">{t['ed_h']}</h2></div><p class="lead rv d2">{t['ed_lead']}</p></div>
<div class="editions">
<figure class="rv"><div class="bezel"><div class="core">{img(root, "hc-spread-3.webp", "Hardcover spread", 2000, 707)}</div></div><figcaption>{t['ed_caps'][0]}</figcaption></figure>
<figure class="rv d1"><div class="bezel"><div class="core">{img(root, "sc-spread-1.webp", "Softcover spread", 1400, 990)}</div></div><figcaption>{t['ed_caps'][1]}</figcaption></figure>
</div></div></section>

<section><div class="wrap">
<div class="sec-head"><div><span class="eyebrow rv">{t['how_eyebrow']}</span><h2 class="rv d1">{t['how_h']}</h2></div></div>
<ol class="steps">{"".join(f'<li class="rv d{i%3}"><h3>{esc(a)}</h3><p>{esc(b)}</p></li>' for i,(a,b) in enumerate(t['steps']))}</ol>
</div></section>

<section id="print"><div class="wrap print">
<div><span class="eyebrow rv">{t['pr_eyebrow']}</span><h2 class="rv d1 my">{t['pr_h']}</h2><p class="lead rv d2">{t['pr_lead']}</p></div>
<div class="rv d1"><table class="spec"><tbody>{"".join(f"<tr><td>{esc(a)}</td><td>{esc(b)}</td></tr>" for a,b in t['spec'])}</tbody></table><p class="muted note">{esc(t['spec_note'])}</p></div>
</div></section>

<section id="faq"><div class="wrap">
<h2 class="rv mb">{t['faq_h']}</h2>
<div class="faq rv d1">{"".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q,a in t['faq'])}</div>
</div></section>

<section class="final"><div class="wrap">
<img src="{root}assets/img/icon.png" alt="" width="96" height="96" class="rv appicon">
<h2 class="rv d1">{t['final_h']}</h2>
<div class="ctas rv d2"><a class="btn btn-primary" href="{DL}">{t['dl']}<span class="ic">{DOWN}</span></a><a class="btn btn-ghost" href="{REPO}">{t['gh']}<span class="ic">{ARROW}</span></a></div>
</div></section>
</main>''')
    out.append(footer(t, root))
    return "\n".join(out)

def legal_pages(mail):
    m = f'<a href="mailto:{mail}">{mail}</a>'
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

def main():
    mail = os.environ.get("CONTACT_EMAIL", "").strip()
    if not mail:
        sys.exit("Set CONTACT_EMAIL (address shown in Impressum and Datenschutz).")
    pages = legal_pages(html.escape(mail))
    here = os.path.dirname(os.path.abspath(__file__))
    pub = os.path.join(here, "public")
    if os.path.exists(pub): shutil.rmtree(pub)
    shutil.copytree(os.path.join(here, "assets"), os.path.join(pub, "assets"))
    for t in T.values():
        d = os.path.join(pub, t["path"]); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w").write(page(t))
        for k in pages: open(os.path.join(d, k + ".html"), "w").write(legal(t, k, pages))
    open(os.path.join(pub, "robots.txt"), "w").write(f"User-agent: *\nAllow: /\nSitemap: {BASE}sitemap.xml\n")
    urls = ["", "de/", "impressum.html", "datenschutz.html", "de/impressum.html", "de/datenschutz.html"]
    open(os.path.join(pub, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<url><loc>{BASE}{u}</loc></url>" for u in urls) + "</urlset>\n")
    print("built", pub)

if __name__ == "__main__": main()
