# Security — Billerbook

Class: **K2** (HD standard "Sicherheitsstandard App-Projekte (OWASP)"). Locally Billerbook is K1 (server code, no accounts). With remote MCP enabled it exposes an OAuth-protected endpoint to the internet that can read and change the user's photo books and write export files on the Mac, so the higher class applies.
Status: 22.11.2026 · Wiki project page: https://wiki.heidrich-digital.de/doc/billerbook-start-hier-handover-21112026-abends-zvEPMzD58g

## Data
- Photo book projects (JSON) and thumbnails in the data folder (`~/Library/Application Support/Billerbook`), originals stay where they are.
- Lightroom catalogs are opened read-only. Only the optional Lightroom plug-in writes, and only collections under *Billerbook*.
- Photos often show family members and friends: personal data of third parties.
- `remote.json`: registered OAuth clients and SHA-256 hashes of access and refresh tokens. File mode 0600.
- Nothing is sent to Anthropic, OpenAI or anyone else unless the user connects an assistant.

## Who may do what
| Who | Reaches | How |
|---|---|---|
| The user at the Mac | editor, HTTP API, `/mcp` | `127.0.0.1` only, no sign-in (single-user desktop app) |
| Local MCP clients (Claude Desktop, Codex, Cursor) | all MCP tools | stdio or `http://127.0.0.1:4580/mcp` |
| Remote assistants (ChatGPT, claude.ai) | `/mcp` with a reduced tool set (no file paths: no folders, catalogs, fonts, project files, `out_dir`, local HTML or ICC paths) | public tunnel address + OAuth 2.1 (PKCE S256), approval needs the six-digit code shown in the app |
| Anyone else on the internet | OAuth metadata, register, authorize page, token | nothing else; app API and editor answer 404 on the public host |
| Web pages in the user's browser | nothing | Host check (DNS rebinding); every changing request needs `Sec-Fetch-Site: same-origin` or a matching `Origin`; JSON only as `application/json` (otherwise 415); no CORS on localhost; editor CSP `script-src 'self'`, `frame-ancestors 'none'` |

## The worst that can happen
1. Someone who finds the tunnel address gets a token without the user's approval and reads or deletes photo books, or uses export tools to write files on the Mac.
2. A web page the user visits drives the local API (CSRF / DNS rebinding) and changes or exports projects.
3. An imported file (web page, PDF, `.billerbook` zip, font) writes outside its folder or makes Billerbook fetch internal addresses.

## Acceptance tests (A01/A07)
| No. | Test | Expectation | Automated |
|---|---|---|---|
| 1 | App API through the public host | 404 | `test/oauth.mjs` |
| 2 | `/mcp` without token through the public host | 401 with `WWW-Authenticate` resource metadata | `test/oauth.mjs` |
| 3 | Authorize with wrong pairing code | 403, no code issued | `test/oauth.mjs` |
| 4 | Auth code used twice | second use 400 | `test/oauth.mjs` |
| 5 | Refresh token rotation | new tokens, old refresh token gone | `test/oauth.mjs` |
| 6 | Local `/mcp` with foreign `Origin` | 403 | `test/oauth.mjs` |
| 7 | `.billerbook` with `../` entry | refused | `test/v011.mjs` |
| 8 | Web import of a local address | refused | `test/v011.mjs` |
| 9 | Changing request from a foreign origin, `Origin: null`, `Sec-Fetch-Site: cross-site`, another local port | 403 | `test/security.mjs` |
| 10 | Second pairing code within 10 s; 20 wrong codes in total | 429; pairing locked (423) until restart | `test/security.mjs` |
| 11 | Colour value with markup via op, MCP or package | 400 on save; package values dropped; SVG escaped | `test/security.mjs` |
| 12 | SSRF: mapped IPv6, `::`, CGNAT, 198.18/15, multicast, redirects to local | refused, checked in the DNS lookup of the connection itself | `test/security.mjs` |
| 13 | Upload of a non-image | 400 | `test/security.mjs` |
| 14 | Remote client: folder paths, local HTML files, removed tools | error / not listed | `test/oauth.mjs` |
| 15 | Reused rotated refresh token | whole token family revoked | `test/oauth.mjs` |
| 16 | OAuth approval in Chrome | redirect to the client succeeds (form-action allows its origin) | manual, `test/browser-oauth.py` |
| 17 | Redirect to a blocked or malformed address during import | rejected, process keeps running | `test/security.mjs` |
| 18 | Remote events with stdio MCP | logged to stderr only, control characters removed | `test/security.mjs` |
| 19 | Capture One collection ids with script code | passed as arguments to a fixed JXA script, never part of the script; Capture One tools not offered to remote clients | `test/captureone.mjs`, `test/oauth.mjs` |
| 20 | IDML export with special characters in text and file names | XML escaped, control characters removed, link file names reduced to safe characters | `test/idml.mjs` |
| 21 | Crafted tone value (`/../../x`) in a project or package, IDML export | tone dropped by `checkProject`, nothing written outside `Links/` | `test/idml.mjs`, `test/v011.mjs` |
| 22 | Package with foreign `sources` (folders, Capture One snapshot with system paths) | sources reset to the package's own photos | `test/v011.mjs` |

## Deliberate exceptions
- **No login on localhost.** Billerbook is a single-user desktop app; the local API trusts processes on the same Mac, like any desktop app does. Reviewed again if Billerbook ever runs as a server for several people.
- **Remote assistants can write export files.** That is the purpose of the export tools. They write only into the default export folder (`~/Desktop/Billerbook-Export`); `out_dir` and every other path argument is refused for remote clients (`REMOTE_DENY` and checks in `mcp.mjs`).
- **cloudflared is a US service.** Optional; the user can enter their own public address instead.

## Review
- 22.11.2026: independent review (G3) found 4 P0, 5 P1, 13 P2. Fixed the same day; the re-check found no P0 and two new P1 (a redirect to a blocked address could end the process; remote events were logged to stdout and broke stdio MCP) plus three P2. All fixed and covered by `test/security.mjs`. Table on the wiki project page.
- 22.11.2026, afternoon: independent review of the 0.11.0 additions (Capture One, IDML, page overview) found no P0, one P1 (tone value as path in the IDML export, reachable only through a crafted project file) and four P2. Fixed in 0.11.1; tests 21 and 22.

## Reporting
Security issues: open a private advisory on GitHub (Security › Report a vulnerability) or write to the address in the imprint of billerbook.heidrich-digital.de.
