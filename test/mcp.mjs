import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
const dir = process.argv[2];
const env = { ...process.env, BILLERBOOK_PORT: '4599', BILLERBOOK_DATA: '/tmp/fbs-mcp/data', BILLERBOOK_CACHE: '/tmp/fbs-mcp/cache' };
const c = new Client({ name: 't', version: '1' });
await c.connect(new StdioClientTransport({ command: 'node', args: ['--disable-warning=ExperimentalWarning', 'mcp.mjs'], env }));
const tools = await c.listTools(); console.log('tools', tools.tools.length, tools.tools.map((t) => t.name).join(' '));
const call = async (name, args) => { const r = await c.callTool({ name, arguments: args }); if (r.isError) throw new Error(r.content[0].text); return r.content[0]; };
const p = JSON.parse((await call('create_project', { name: 'MCP Test', image_folder: dir })).text); console.log('project', p.id, p.editions.map((e) => e.name));
console.log((await call('auto_layout', { project: 'MCP Test', edition: 'Hardcover', per_page: 4 })).text);
const imgs = JSON.parse((await call('list_images', { project: 'MCP Test', edition: 'Softcover', filter: 'unplaced', limit: 3 })).text); console.log('unplaced softcover', imgs.total);
await call('add_edition', { project: 'MCP Test', name: 'Mini', format: 'sc-a5-hoch', copy_from: 'Hardcover' });
await call('set_page_layout', { project: 'MCP Test', edition: 'Mini', page: 1, layout: 'dps-voll' });
const v = await call('view_spread', { project: 'MCP Test', edition: 'Mini', spread: 1 }); fs.writeFileSync('/tmp/fbs-mcp/view.jpg', Buffer.from(v.data, 'base64')); console.log('view', v.type, v.mimeType);
console.log((await call('preflight', { project: 'MCP Test', edition: 'Mini' })).text.slice(0, 300));
const ex = JSON.parse((await call('export_pdf', { project: 'MCP Test', edition: 'Mini', preview: true, out_dir: '/tmp/fbs-mcp/out' })).text); console.log('export', ex.state, ex.files.map((f) => f.file));
// 0.10 print setup through MCP only
const fm = JSON.parse((await call('list_formats', { provider: 'kdp' })).text); console.log('kdp papers', fm[0].bindings.softcover.papers.map((x) => x.id).join(','));
await call('add_edition', { project: 'MCP Test', name: 'KDP', provider: 'kdp', format: 'kdp-sc-85x11', paper: 'cream', copy_from: 'Hardcover' });
const specs = JSON.parse((await call('get_print_specs', { project: 'MCP Test', edition: 'KDP' })).text); console.log('kdp spine', specs.spine, 'cover', specs.cover.pdf_mm);
const saal = JSON.parse((await call('set_print_setup', { project: 'MCP Test', edition: 'Mini', provider: 'saal', format: 'saal-30x30' })).text); console.log('saal', saal.interior.layout, saal.interior.pdfPages, saal.interior.pdfPage_mm);
const tpl = JSON.parse((await call('import_cover_template', { project: 'MCP Test', edition: 'Mini', width_mm: 700, height_mm: 340 })).text); console.log('template spine', tpl.spine);
console.log((await call('page_tools', { project: 'MCP Test', edition: 'Hardcover', action: 'duplicate', page: 1 })).text);
console.log((await call('page_tools', { project: 'MCP Test', edition: 'Hardcover', action: 'save_layout', page: 1, name: 'Mein Layout' })).text.slice(0, 80));
console.log((await call('set_page_style', { project: 'MCP Test', edition: 'Hardcover', page: 2, gap: 8, hide_number: true })).text);
console.log((await call('lightroom_usage', {})).text.slice(0, 200));
const prof = JSON.parse((await call('save_print_profile', { project: 'MCP Test', from_edition: 'KDP', name: 'Copy shop' })).text); console.log('profile', prof.id);
// UI smoke: static + api
for (const u of ['/', '/app.js', '/api/system', `/api/project/${p.id}/pool`]) { const r = await fetch(`http://127.0.0.1:4599${u}`); console.log(u, r.status); }
await c.close(); process.exit(0);
