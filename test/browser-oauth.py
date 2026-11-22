# Manual check (needs a running server on port 4633 and Python Playwright): editor loads without CSP errors, OAuth consent redirects in Chrome.
# BILLERBOOK_PORT=4633 node server.mjs &  then  python3 test/browser-oauth.py
import json, urllib.request, hashlib, base64, threading, http.server
from playwright.sync_api import sync_playwright
L='http://localhost:4633'
def post(p, body, ct='application/json'):
    r=urllib.request.Request(L+p, data=json.dumps(body).encode(), headers={'content-type':ct}, method='POST')
    return json.loads(urllib.request.urlopen(r).read())
pr=post('/api/projects',{'name':'CSP'})
hit={}
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s): hit['url']=s.path; s.send_response(200); s.end_headers(); s.wfile.write(b'ok')
    def log_message(*a): pass
cb=http.server.HTTPServer(('127.0.0.1',0),H); cbp=cb.server_address[1]
threading.Thread(target=cb.serve_forever,daemon=True).start()
reg=post('/oauth/register',{'client_name':'Test','redirect_uris':[f'http://localhost:{cbp}/cb']})
ch=base64.urlsafe_b64encode(hashlib.sha256(b'v'*50).digest()).decode().rstrip('=')
from urllib.parse import urlencode
q=urlencode({'response_type':'code','client_id':reg['client_id'],'redirect_uri':reg['redirect_uris'][0],'code_challenge':ch,'code_challenge_method':'S256','state':'s'})
code=post('/api/remote/pair',{})['code']
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f"{L}/#{pr['id']}"); pg.wait_for_timeout(3000)
    pg.screenshot(path='/tmp/csp-editor.png')
    pg.goto(f"{L}/oauth/authorize?{q}"); pg.fill('input[name=pair]', code); pg.click('button'); pg.wait_for_timeout(2000)
    b.close()
print('editor errors:', [e for e in errs if 'favicon' not in e][:6])
print('callback:', hit.get('url','')[:40])
