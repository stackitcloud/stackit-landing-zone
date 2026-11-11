import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadUbuntuPackage, ubuntuPackageMirrors } from '../../deploy/runner/download-ubuntu-package.mjs';
import { rewriteUbuntuSources, applyUbuntuMirror, fallbackUbuntuMirror } from './ubuntu-mirror.mjs';
import { installBrowser as installBrowserReal, ubuntuRepositoryDnsFails } from './install-browser.mjs';
const installBrowser = (run, configure, dnsFails = () => false) => installBrowserReal(run, configure, dnsFails);

const filename = 'python3.10-minimal_3.10.12-1~22.04.18_amd64.deb';
const bytes = Buffer.from('synthetic pinned package');
const sha = createHash('sha256').update(bytes).digest('hex');
const dnsFailure = { status: 100, diagnostics: "Temporary failure resolving 'security.ubuntu.com'" };

test('pinned packages fall through independent HTTPS sources without changing their identity', () => {
  const urls = [];
  assert.equal(downloadUbuntuPackage(filename, sha, url => {
    urls.push(url);
    if (urls.length < 3) throw Object.assign(Error('DNS unavailable'), { status: 6 });
    return bytes;
  }), bytes);
  assert.deepEqual(urls, ubuntuPackageMirrors.map(root => `${root}/pool/main/p/python3.10/${filename}`));
  assert.ok(urls.every(url => new URL(url).protocol === 'https:'));
});

test('reachable modified bytes fail integrity immediately instead of being hidden by fallback', () => {
  let calls = 0;
  assert.throws(() => downloadUbuntuPackage(filename, sha, () => {
    calls++; return Buffer.from('different bytes');
  }), /checksum mismatch/);
  assert.equal(calls, 1);
});

test('a failed TLS verification is not retried against other mirrors', () => {
  let calls = 0;
  assert.throws(() => downloadUbuntuPackage(filename, sha, () => {
    calls++; throw Object.assign(Error('TLS verification failed'), { status: 60 });
  }), /transport failed/);
  assert.equal(calls, 1);
});

test('unavailable packages terminate after the finite allowlist', () => {
  let calls = 0;
  assert.throws(() => downloadUbuntuPackage(filename, sha, () => {
    calls++; throw Object.assign(Error('timeout'), { status: 28 });
  }), /All approved Ubuntu package mirrors unavailable/);
  assert.equal(calls, 3);
});

test('invalid filenames and checksum inputs cannot reach the downloader', () => {
  for (const [name, hash] of [['../evil_amd64.deb', sha], [filename + '?redirect=evil', sha], [filename, 'not-a-hash']])
    assert.throws(() => downloadUbuntuPackage(name, hash, () => assert.fail('network must not run')), /Invalid pinned/);
});

test('deb822 fallback preserves Ubuntu signing key, suites, components and unrelated repository settings', () => {
  const source = `Types: deb deb-src\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: resolute resolute-updates resolute-security\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\nTypes: deb\nURIs: https://packages.microsoft.com/ubuntu/26.04/prod\nSuites: resolute\nSigned-By: /usr/share/keyrings/microsoft.gpg\n`;
  assert.equal(rewriteUbuntuSources(source, true), source.replace('mirror+file:/etc/apt/apt-mirrors.txt', fallbackUbuntuMirror));
});

test('all supported Ubuntu repository forms retain existing authentication options', () => {
  for (const uri of ['http://azure.archive.ubuntu.com/ubuntu/', 'https://archive.ubuntu.com/ubuntu', 'http://security.ubuntu.com/ubuntu', 'mirror+file:/etc/apt/apt-security-mirrors.txt', 'mirror+file:///etc/apt/apt-mirrors.txt']) {
    const source = `# comment\ndeb [arch=amd64 signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] ${uri} resolute-security main\n`;
    assert.equal(rewriteUbuntuSources(source, false), source.replace(uri, fallbackUbuntuMirror));
  }
});

test('unknown, credentialed and lookalike URLs are never rewritten', () => {
  for (const uri of ['https://security.ubuntu.com.evil.test/ubuntu', 'https://security.ubuntu.com/other', 'https://user:password@security.ubuntu.com/ubuntu', 'https://security.ubuntu.com/ubuntu?other=1', 'mirror+file:/tmp/other-mirrors.txt']) {
    const source = `URIs: ${uri}\n`;
    assert.equal(rewriteUbuntuSources(source, true), source);
  }
});

test('source rewriting does not operate on commented-out repository definitions', () => {
  const source = '# URIs: https://security.ubuntu.com/ubuntu\n# deb https://archive.ubuntu.com/ubuntu resolute main\n';
  assert.equal(rewriteUbuntuSources(source, true), source);
  assert.equal(rewriteUbuntuSources(source, false), source);
});

test('filesystem fallback changes only source files and refuses symlink traversal', () => {
  const root = mkdtempSync(join(tmpdir(), 'lzc-apt-test-'));
  try {
    mkdirSync(join(root, 'sources.list.d'));
    const file = join(root, 'sources.list.d/ubuntu.sources');
    const source = 'URIs: https://archive.ubuntu.com/ubuntu\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
    writeFileSync(file, source);
    writeFileSync(join(root, 'sources.list.d/retained.txt'), 'untouched');
    applyUbuntuMirror(root);
    assert.equal(readFileSync(file, 'utf8'), source.replace('https://archive.ubuntu.com/ubuntu', fallbackUbuntuMirror));
    assert.equal(readFileSync(join(root, 'sources.list.d/retained.txt'), 'utf8'), 'untouched');
    assert.throws(() => applyUbuntuMirror(root), /No supported Ubuntu APT source/);
    symlinkSync(join(root, 'sources.list.d/retained.txt'), join(root, 'sources.list.d/unsafe.sources'));
    assert.throws(() => applyUbuntuMirror(root), /regular file/);
    assert.equal(readFileSync(join(root, 'sources.list.d/retained.txt'), 'utf8'), 'untouched');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('successful browser installation does not change APT repositories', async () => {
  await installBrowser(async () => ({ status: 0, diagnostics: '' }), () => assert.fail('no fallback needed'));
});

test('DNS preflight bounds resolver failures and rejects unrelated process errors', () => {
  const hosts = [];
  assert.equal(ubuntuRepositoryDnsFails(host => { hosts.push(host); return { status: 0 }; }), false);
  assert.equal(hosts.length, 3);
  assert.equal(ubuntuRepositoryDnsFails(() => ({ status: 2 })), true);
  assert.equal(ubuntuRepositoryDnsFails(() => ({ status: null, error: { code: 'ETIMEDOUT' } })), true);
  assert.throws(() => ubuntuRepositoryDnsFails(() => ({ status: null, error: { code: 'ENOENT' } })), /preflight could not complete/);
  assert.throws(() => ubuntuRepositoryDnsFails(() => ({ status: null, signal: 'SIGTERM' })), /preflight could not complete/);
});

test('an unavailable resolver switches once before slow APT retries, and still requires installation success', async () => {
  const events = [];
  await installBrowser(async () => { events.push('install'); return { status: 0 }; }, () => events.push('configure'), () => true);
  assert.deepEqual(events, ['configure', 'install']);
  let calls = 0;
  await assert.rejects(installBrowser(async () => { calls++; return dnsFailure; }, () => {}, () => true), /single Ubuntu mirror fallback/);
  assert.equal(calls, 1);
});

test('Ubuntu DNS failure permits one authenticated-mirror installation before browser tests run', async () => {
  const events = [];
  await installBrowser(async () => { events.push('install'); return events.length === 1 ? dnsFailure : { status: 0 }; }, () => events.push('configure'));
  assert.deepEqual(events, ['install', 'configure', 'install']);
});

test('mirror failure terminates and cannot become an installation success', async () => {
  let calls = 0;
  await assert.rejects(installBrowser(async () => { calls++; return dnsFailure; }, () => {}), /single Ubuntu mirror fallback/);
  assert.equal(calls, 2);
});

test('browser CDN errors, signature failures and cancellation do not trigger Ubuntu mirror changes', async () => {
  for (const failure of [
    { status: 1, diagnostics: 'Could not resolve host: cdn.playwright.dev' },
    { status: 100, diagnostics: 'The following signatures were invalid: BADSIG' },
    { status: null, diagnostics: dnsFailure.diagnostics },
  ])
    await assert.rejects(installBrowser(async () => failure, () => assert.fail('not an Ubuntu DNS failure')), /fallback does not apply/);
});
