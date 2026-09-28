'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { lint } = require('../src');
const { globToRe } = require('../src/site');
const { normAddress, phoneDigits, findPhones } = require('../src/nap');

const res = lint(path.join(__dirname, 'fixtures', 'site'));
const has = (rule, file) => res.findings.some((f) => f.rule === rule && (!file || f.file === file));

test('detects business details from homepage schema', () => {
  assert.strictEqual(res.business.name, 'Oak Street Plumbing');
  assert.strictEqual(phoneDigits(res.business.phone), '6615550123');
});
test('broken internal link, but not existing assets', () => {
  assert.ok(has('broken-link', 'index.html'));
  assert.ok(!res.findings.some((f) => f.rule === 'broken-link' && /guide\.pdf/.test(f.message)));
});
test('invalid JSON-LD', () => assert.ok(has('json-ld-syntax', 'services.html')));
test('schema phone that disagrees with the business', () => assert.ok(has('nap-schema-mismatch', 'contact.html')));
test('visible phone that disagrees with the business', () => {
  assert.ok(has('nap-phone-mismatch', 'services.html'));
  assert.ok(!has('nap-phone-mismatch', 'index.html'));
});
test('address variants: equivalent spelling passes, missing suite is flagged', () => {
  assert.ok(!has('nap-address-mismatch', 'services.html'));
  assert.ok(has('nap-address-mismatch', 'contact.html'));
});
test('canonical missing', () => assert.ok(has('canonical-missing', 'contact.html')));
test('sitemap problems', () => {
  assert.ok(has('sitemap-dead-url', 'sitemap.xml'));
  assert.ok(has('sitemap-page-missing', 'drain-cleaning-bakersfield.html'));
});
test('orphan page', () => assert.ok(has('orphan-page', 'drain-cleaning-bakersfield.html')));
test('duplicate title and keyword overlap', () => {
  assert.ok(has('title-duplicate', 'services.html'));
  assert.ok(has('keyword-overlap'));
});
test('redirected pages are skipped', () => {
  assert.ok(!res.findings.some((f) => f.file === 'old-page.html'));
});
test('helpers', () => {
  assert.strictEqual(normAddress('123 Example Avenue #4'), normAddress('123 Example Ave, Suite 4'));
  assert.deepStrictEqual(findPhones('Call (661) 555-0123 or +1 661.555.0199').map((p) => p.digits), ['6615550123', '6615550199']);
  assert.ok(globToRe('drafts/**').test('drafts/a/b.html'));
  assert.ok(!globToRe('*.html').test('a/b.html'));
});
test('exit status data', () => { assert.ok(res.errors > 0); assert.ok(res.warnings > 0); });
test('AI search crawler blocked in robots.txt (training-only bots are not flagged)', () => {
  const f = res.findings.find((x) => x.rule === 'ai-crawler-blocked');
  assert.ok(f && /PerplexityBot/.test(f.message));
  assert.ok(!/GPTBot/.test(f.message));
});
test('business schema without sameAs links', () => assert.ok(has('ai-entity-links-missing', 'index.html')));
test('robots.txt reader', () => {
  const { robotsBlocksRoot } = require('../src/checks');
  assert.ok(robotsBlocksRoot('User-agent: *\nDisallow: /', 'OAI-SearchBot'));
  assert.ok(!robotsBlocksRoot('User-agent: *\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /', 'OAI-SearchBot'));
  assert.ok(!robotsBlocksRoot('User-agent: *\nDisallow: /admin/', 'PerplexityBot'));
  assert.ok(robotsBlocksRoot('User-agent: GPTBot\nUser-agent: PerplexityBot\nDisallow: /', 'PerplexityBot'));
});
