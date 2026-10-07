const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const password = ' test-only-admin-password ';
const secret = 'test-only-signing-secret-not-a-deployment-credential';

async function fixture(t, configured = true, overridePassword, enforceHttps = false) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-auth-test-'));
    for (const name of ['server.js', 'catalog-pricing.js', 'seo-renderer.cjs']) fs.copyFileSync(path.join(root, name), path.join(dir, name));
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
    fs.writeFileSync(path.join(dir, '.env'), [
        'NODE_ENV=production',
        'PORT=39999',
        'HOST=127.0.0.1',
        'DATABASE_URL=postgres://test:test@127.0.0.1:1/unavailable_test_database',
        `UPLOAD_DIR=${path.join(dir, 'uploads')}`,
        'CORS_ORIGINS=https://pharmacies.doctor/,https://www.pharmacies.doctor',
        configured ? `ADMIN_PASSWORD="${password}"` : 'ADMIN_PASSWORD=',
        configured ? `ADMIN_TOKEN_SECRET=${secret}` : 'ADMIN_TOKEN_SECRET=',
    ].join('\n'));
    const env = { ...process.env, NODE_ENV: 'production', PORT: '0', ENFORCE_HTTPS: String(enforceHttps), BACKEND_URL: 'https://pd.pharmacies.doctor' };
    for (const key of ['DATABASE_URL', 'UPLOAD_DIR', 'CORS_ORIGINS', 'ADMIN_PASSWORD', 'ADMIN_TOKEN_SECRET', 'ADMIN_TOKEN_TTL_SECONDS', 'HOST', 'SMTP_USER', 'SMTP_PASS']) delete env[key];
    if (overridePassword) env.ADMIN_PASSWORD = overridePassword;
    // Deliberately start from a different working directory than server.js.
    const child = spawn(process.execPath, [path.join(dir, 'server.js')], { cwd: os.tmpdir(), env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
            const exited = new Promise(resolve => child.once('exit', resolve));
            child.kill('SIGTERM');
            await exited;
        }
        fs.rmSync(dir, { recursive: true, force: true });
    });
    const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server did not start: ' + stderr)), 30000);
        child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited ' + code + ': ' + stderr)); });
        let output = '';
        child.stdout.on('data', chunk => {
            output += chunk;
            const match = output.match(/API listening on 127\.0\.0\.1:(\d+)/);
            if (match) { clearTimeout(timer); resolve(Number(match[1])); }
        });
    });
    return async (route, options = {}) => fetch(`http://127.0.0.1:${port}${route}`, options);
}

const loginOptions = value => ({ method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://pharmacies.doctor' }, body: JSON.stringify({ password: value }) });

test('invalid hosting PORT fails with a clear configuration error', async () => {
    const child = spawn(process.execPath, [path.join(root, 'server.js')], {
        cwd: os.tmpdir(),
        env: { ...process.env, NODE_ENV: 'development', PORT: 'undefined', DATABASE_URL: 'postgres://test:test@127.0.0.1:1/test' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    const code = await new Promise(resolve => child.once('exit', resolve));
    assert.notEqual(code, 0);
    assert.match(stderr, /PORT must be a number/);
});

test('production .env, CORS, login, token rejection and unavailable database', async t => {
    const request = await fixture(t);
    assert.equal((await request('/health')).status, 200);
    assert.equal((await request('/health/ready')).status, 503);
    for (const origin of ['https://pharmacies.doctor', 'https://www.pharmacies.doctor']) {
        const response = await request('/api/admin/login', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
        assert.match(response.headers.get('access-control-allow-headers'), /Authorization/);
    }
    const denied = await request('/api/admin/login', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    const wrong = await request('/api/admin/login', loginOptions('wrong'));
    assert.equal(wrong.status, 401);
    assert.equal(wrong.headers.get('access-control-allow-origin'), 'https://pharmacies.doctor');
    assert.equal((await request('/api/admin/login', loginOptions({}))).status, 401);
    const success = await request('/api/admin/login', loginOptions(password));
    assert.equal(success.status, 200);
    const { token } = await success.json();
    assert.equal(success.headers.get('cache-control'), 'no-store');
    assert.equal((await request('/api/admin/session', { headers: { Authorization: `Bearer ${token}` } })).status, 200);
    assert.equal((await request('/api/admin/session')).status, 401);
    for (const invalid of [token + '.extra', token + 'tampered']) {
        assert.equal((await request('/api/admin/session', { headers: { Authorization: `Bearer ${invalid}` } })).status, 401);
    }
    const payload = Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    assert.equal((await request('/api/admin/session', { headers: { Authorization: `Bearer ${payload}.${signature}` } })).status, 401);
    const orders = await request('/api/orders', { headers: { Origin: 'https://pharmacies.doctor', Authorization: `Bearer ${token}` } });
    assert.equal(orders.status, 503);
    assert.equal((await orders.json()).code, 'DATABASE_UNAVAILABLE');
    const malformed = await request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
});

test('missing admin settings fail closed with readable CORS response', async t => {
    const request = await fixture(t, false);
    const preflight = await request('/api/admin/login', { method: 'OPTIONS', headers: { Origin: 'https://pharmacies.doctor', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(preflight.status, 204);
    const response = await request('/api/admin/login', loginOptions(password));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://pharmacies.doctor');
    assert.equal((await response.json()).code, 'ADMIN_NOT_CONFIGURED');
});

test('hosting environment overrides .env and login attempts are limited', async t => {
    const request = await fixture(t, true, 'hosting-panel-password');
    assert.equal((await request('/api/admin/login', loginOptions('hosting-panel-password'))).status, 200);
    for (let i = 0; i < 9; i++) assert.equal((await request('/api/admin/login', loginOptions('wrong'))).status, 401);
    const limited = await request('/api/admin/login', loginOptions('wrong'));
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
});


test('production redirects HTTP to the configured HTTPS origin and accepts proxied HTTPS', async t => {
    const request = await fixture(t, true, undefined, true);
    const insecure = await request('/api/products?test=1', { redirect: 'manual', headers: { Host: 'untrusted.example' } });
    assert.equal(insecure.status, 308);
    assert.equal(insecure.headers.get('location'), 'https://pd.pharmacies.doctor/api/products?test=1');
    const proxiedProducts = await request('/api/products', { headers: { 'X-Forwarded-Proto': 'https' } });
    assert.equal(proxiedProducts.status, 503);
    assert.equal((await proxiedProducts.json()).code, 'DATABASE_UNAVAILABLE');
    assert.equal((await request('/health')).status, 200);
});
