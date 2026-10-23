"""Local browser QA. Blocks third-party requests and never submits real orders/leads."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[2]/'pharmacies frontnend'
out=root/'validation'
pages=['/','/shop','/pain-relief','/mens-health','/sleep-anxiety','/about','/contact','/adderall-30mg','/checkout','/blog','/blog/cenforce-for-erectile-dysfunction-uses-benefits-and-safety','/site-map','/privacy-policy']
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    context=browser.new_context()
    def route_request(route):
        url=route.request.url
        if url.startswith('http://127.0.0.1:5500/'):
            route.continue_()
        elif '/api/products' in url:
            route.fulfill(status=200,content_type='application/json',body='[]')
        elif '/api/leads/status' in url:
            route.fulfill(status=200,content_type='application/json',body='{"unlocked":false}')
        else:
            route.abort()
    context.route('**/*',route_request)
    page=context.new_page()
    for width in [320,375,768,1440]:
        page.set_viewport_size({'width':width,'height':900})
        for url in pages:
            errors=[]
            handler=lambda e:errors.append(str(e))
            page.on('pageerror',handler)
            response=page.goto('http://127.0.0.1:5500'+url,wait_until='load')
            page.wait_for_timeout(180)
            result=page.evaluate('''() => ({h1:document.querySelectorAll('h1').length, viewport:innerWidth, width:document.documentElement.scrollWidth, overflows:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.right>innerWidth+2&&s.position!=='fixed'&&s.visibility!=='hidden'&&!e.closest('#mobileNav,.mobile-nav,.modal,.page:not(.active),#rxhAssistant')}).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,right:Math.round(e.getBoundingClientRect().right)})),brokenImages:[...document.images].filter(e=>e.getAttribute('src')?.startsWith('/')&&e.loading!=='lazy'&&!e.naturalWidth).map(e=>e.getAttribute('src'))})''')
            result.update(page=url,viewport=width,status=response.status,errors=errors)
            results.append(result)
            page.remove_listener('pageerror',handler)
            if width in [375,1440] and url in ['/','/adderall-30mg','/blog']:
                page.screenshot(path=str(out/(('home' if url=='/' else url[1:])+f'-{width}.png')),full_page=True)
    page.set_viewport_size({'width':375,'height':850})
    page.goto('http://127.0.0.1:5500/',wait_until='load')
    button=page.locator('.site-header .hamburger')
    button.click()
    page.wait_for_timeout(400)  # Drawer has a 350 ms slide-in transition.
    assert page.locator('#mobileNav').is_visible(), 'Mobile navigation failed'
    page.keyboard.press('Escape')
    if page.locator('#rxhSignupTrigger').count():
        page.locator('#rxhSignupTrigger').click(force=True)
        assert page.locator('#rxhLeadGate').is_visible()
        page.keyboard.press('Escape')
        assert not page.locator('#rxhLeadGate').is_visible(), 'Signup cannot be dismissed'
    assert 'rxh-gate-locked' not in (page.locator('body').get_attribute('class') or '')
    # Missing articles must be a real 404, and static articles work with JS disabled.
    assert page.goto('http://127.0.0.1:5500/blog/does-not-exist').status==404
    nojs=browser.new_context(java_script_enabled=False)
    article=nojs.new_page()
    article.goto('http://127.0.0.1:5500/blog/cenforce-for-erectile-dysfunction-uses-benefits-and-safety')
    assert len(article.locator('#post-content').inner_text())>100
    browser.close()
report={'checks':len(results),'failures':[r for r in results if r['status']!=200 or r['h1']!=1 or r['width']>r['viewport']+1 or r['overflows'] or r['errors'] or r['brokenImages']], 'results':results}
(out/'browser-seo.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'checks':report['checks'],'failures':report['failures']},indent=2))
