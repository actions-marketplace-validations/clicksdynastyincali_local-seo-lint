'use strict';
const fs = require('fs');
const path = require('path');
const { phoneDigits, findPhones, normAddress, normName, businessEntities } = require('./nap');

const RULES = {
  'json-ld-syntax': { severity: 'error', about: 'JSON-LD blocks must be valid JSON, or search engines ignore them.' },
  'nap-schema-mismatch': { severity: 'error', about: 'Business schema on a page disagrees with your business name, address or phone.' },
  'nap-phone-mismatch': { severity: 'warn', about: 'A phone number on the page differs from your business phone.' },
  'nap-address-mismatch': { severity: 'warn', about: 'Your address is written differently on this page.' },
  'schema-not-visible': { severity: 'warn', about: 'Schema says something the visitor cannot see on the page.' },
  'canonical-missing': { severity: 'warn', about: 'Page has no canonical tag.' },
  'canonical-multiple': { severity: 'error', about: 'Page has more than one canonical tag.' },
  'canonical-relative': { severity: 'warn', about: 'Canonical URL should be absolute (https://...).' },
  'canonical-other-page': { severity: 'warn', about: 'Canonical points to a different page, so this page will not rank.' },
  'canonical-broken': { severity: 'error', about: 'Canonical points to a page that does not exist.' },
  'sitemap-missing': { severity: 'warn', about: 'No sitemap.xml found.' },
  'sitemap-page-missing': { severity: 'warn', about: 'Indexable page is not listed in sitemap.xml.' },
  'sitemap-dead-url': { severity: 'error', about: 'sitemap.xml lists a URL with no matching page.' },
  'sitemap-noindex': { severity: 'error', about: 'sitemap.xml lists a page marked noindex.' },
  'orphan-page': { severity: 'warn', about: 'No other page links here, so crawlers struggle to find it.' },
  'broken-link': { severity: 'error', about: 'Internal link points to a page that does not exist.' },
  'title-missing': { severity: 'error', about: 'Page has no <title>.' },
  'title-duplicate': { severity: 'warn', about: 'Several pages share the same title.' },
  'description-missing': { severity: 'warn', about: 'Page has no meta description.' },
  'description-duplicate': { severity: 'warn', about: 'Several pages share the same meta description.' },
  'h1-missing': { severity: 'warn', about: 'Page has no <h1>.' },
  'keyword-overlap': { severity: 'warn', about: 'Two pages target nearly the same search, so they compete with each other.' },
  'ai-crawler-blocked': { severity: 'error', about: 'robots.txt blocks an AI search crawler, so ChatGPT, Perplexity or Claude cannot read or recommend the site.' },
  'ai-entity-links-missing': { severity: 'warn', about: 'Business schema has no sameAs profile links, so AI tools cannot confirm which business this is.' },
};

// Crawlers that fetch pages for AI search answers (not model training). Blocking these hides a business from AI recommendations.
const AI_SEARCH_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'Claude-SearchBot', 'Claude-User', 'Bingbot', 'Applebot'];

// Minimal robots.txt reader: returns true if `agent` may not fetch "/".
function robotsBlocksRoot(txt, agent) {
  const groups = []; let cur = null, lastWasAgent = false;
  txt.split(/\r?\n/).forEach((raw) => {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) return;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') { if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(val.toLowerCase()); lastWasAgent = true; return; }
    lastWasAgent = false;
    if (cur && (key === 'allow' || key === 'disallow')) cur.rules.push({ allow: key === 'allow', path: val });
  });
  const a = agent.toLowerCase();
  let rules = groups.filter((g) => g.agents.includes(a)).flatMap((g) => g.rules);
  if (!groups.some((g) => g.agents.includes(a))) rules = groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
  const hits = rules.filter((r) => r.path && '/'.startsWith(r.path.replace(/\*$/, '').replace(/\$$/, '')));
  if (!hits.length) return false;
  const best = hits.reduce((x, y) => (y.path.length > x.path.length || (y.path.length === x.path.length && y.allow) ? y : x));
  return !best.allow;
}

const STOP = new Set('a an and or the of in on for to with by at from your our you we is are be as it this that best top free near me vs & | - – — : , ca usa us'.split(' '));

function resolver(site, siteOrigin) {
  const hosts = new Set();
  if (siteOrigin) { const h = new URL(siteOrigin).host.replace(/^www\./, ''); hosts.add(h); hosts.add('www.' + h); }
  const lookup = (p) => {
    let dp; try { dp = decodeURIComponent(p); } catch (e) { dp = p; }
    return site.byPath.get(dp) || site.byPath.get(dp + (dp.endsWith('/') ? 'index.html' : '/index.html')) || site.byPath.get(dp + '.html') || site.byPath.get(dp.replace(/\/$/, '')) || null;
  };
  const resolve = (fromPath, href) => {
    if (!href) return { skip: true };
    const h = href.trim();
    if (/^(mailto:|tel:|javascript:|data:|sms:|#)/i.test(h)) return { skip: true };
    let u;
    try { u = new URL(h, 'https://local.invalid' + fromPath); } catch (e) { return { skip: true }; }
    const local = u.host === 'local.invalid' || hosts.has(u.host);
    if (!local) return { external: true };
    const page = lookup(u.pathname);
    let asset = false;
    if (!page) { let dp; try { dp = decodeURIComponent(u.pathname); } catch (e) { dp = u.pathname; } const f = path.join(site.root, dp); asset = dp !== '/' && fs.existsSync(f) && fs.statSync(f).isFile(); }
    return { path: u.pathname, page, asset, absolute: u.host !== 'local.invalid' };
  };
  return { resolve, lookup };
}

function detectBusiness(site, cfg) {
  if (cfg.business && (cfg.business.name || cfg.business.phone || cfg.business.address)) {
    const b = cfg.business;
    return { source: 'config', name: b.name || null, phone: b.phone || null, street: (b.address && b.address.street) || b.street || null, postalCode: (b.address && b.address.postalCode) || b.postalCode || null };
  }
  const home = site.byPath.get('/') || site.pages[0];
  if (!home) return null;
  const ents = businessEntities(home.jsonldParsed).filter((e) => e.street || e.telephone);
  if (!ents.length) return null;
  const e = ents[0];
  return { source: 'schema on ' + home.file, name: e.name, phone: e.telephone, street: e.street, postalCode: e.postalCode };
}

const GENERIC_SEG = new Set(['about us', 'about', 'contact us', 'contact', 'home', 'homepage', 'blog', 'faq', 'faqs', 'services', 'privacy policy', 'terms of service', 'careers', 'press', 'login', 'client login']);

// Each title segment (split on | – — :) plus the H1 is a "target phrase".
function targetPhrases(p, brand) {
  const brandWords = new Set(brand ? normName(brand).split(' ') : []);
  const segs = (p.title || '').split(/\s[|–—:-]\s|\s\|\s?|\s[–—]\s?/).map((x) => x.trim()).filter(Boolean);
  if (p.h1[0]) segs.push(p.h1[0]);
  return segs
    .map((seg, i) => ({ seg, first: i === 0, h1: i === segs.length - 1 && !!p.h1[0] }))
    .filter(({ seg }) => !(brand && normName(seg) === normName(brand)) && !GENERIC_SEG.has(seg.toLowerCase()))
    .map(({ seg, first, h1 }) => ({ seg, first, h1, key: normName(seg), t: new Set(seg.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w) && w.length > 1 && !brandWords.has(w))) }))
    .filter((x) => x.t.size >= 2);
}

function run(site, cfg = {}) {
  const findings = [];
  const add = (rule, file, message) => findings.push({ rule, severity: RULES[rule].severity, file, message });
  const pages = site.pages;
  const home = site.byPath.get('/');
  const siteOrigin = cfg.siteUrl || (home && home.canonicals[0] && /^https?:\/\//.test(home.canonicals[0]) ? new URL(home.canonicals[0]).origin : null);
  const { resolve } = resolver(site, siteOrigin);
  const business = detectBusiness(site, cfg);
  const bizPhone = business && business.phone ? phoneDigits(business.phone) : null;
  const bizStreet = business && business.street ? normAddress(business.street) : null;
  const bizZip = business && business.postalCode ? String(business.postalCode).trim() : null;
  const bizStreetNum = bizStreet ? (bizStreet.match(/^\d+/) || [null])[0] : null;
  const indexable = pages.filter((p) => !p.noindex && !p.redirected && !/(^|\/)404\.html?$/i.test(p.file));

  // Links, orphans
  const inbound = new Map(pages.map((p) => [p.file, 0]));
  pages.forEach((p) => {
    const seen = new Set();
    p.hrefs.forEach((href) => {
      const r = resolve(p.urlPath, href);
      if (r.skip || r.external) return;
      if (!r.page && r.asset) return;
      if (!r.page) { if (!seen.has('x' + r.path)) add('broken-link', p.file, `Link to "${href}" goes nowhere.`); seen.add('x' + r.path); return; }
      if (r.page !== p && !seen.has(r.page.file)) { inbound.set(r.page.file, inbound.get(r.page.file) + 1); seen.add(r.page.file); }
    });
  });
  indexable.forEach((p) => { if (p.urlPath !== '/' && inbound.get(p.file) === 0) add('orphan-page', p.file, 'No other page links to this page.'); });

  // Canonicals
  pages.forEach((p) => {
    if (p.noindex || p.redirected) return;
    if (!p.canonicals.length) return add('canonical-missing', p.file, 'Add <link rel="canonical" href="' + (siteOrigin || 'https://your-site') + p.urlPath + '">.');
    if (p.canonicals.length > 1) add('canonical-multiple', p.file, `Found ${p.canonicals.length} canonical tags; keep one.`);
    const c = p.canonicals[0];
    if (!/^https?:\/\//i.test(c)) add('canonical-relative', p.file, `Canonical "${c}" is relative; use the full https:// URL.`);
    const r = resolve(p.urlPath, c);
    if (r.external) return;
    if (!r.skip && !r.page) add('canonical-broken', p.file, `Canonical "${c}" points to a page that does not exist.`);
    else if (r.page && r.page !== p) add('canonical-other-page', p.file, `Canonical points to ${r.page.file}, so this page is hidden from search. Intended?`);
  });

  // Sitemap
  if (!site.sitemap) add('sitemap-missing', 'sitemap.xml', 'Create a sitemap.xml listing every page you want indexed.');
  else {
    const listed = new Set();
    site.sitemap.urls.forEach((u) => {
      const r = resolve('/', u);
      if (r.external) return;
      if (!r.page) add('sitemap-dead-url', site.sitemap.file, `Lists ${u}, but no such page exists.`);
      else { listed.add(r.page.file); if (r.page.noindex) add('sitemap-noindex', site.sitemap.file, `Lists ${u}, but that page is marked noindex.`); }
    });
    indexable.forEach((p) => {
      const canonicalElsewhere = p.canonicals[0] && (() => { const r = resolve(p.urlPath, p.canonicals[0]); return r.page && r.page !== p; })();
      if (!listed.has(p.file) && !canonicalElsewhere) add('sitemap-page-missing', p.file, 'Not listed in sitemap.xml.');
    });
  }

  // Titles, descriptions, h1
  const dupes = (key, rule, label) => {
    const m = new Map();
    indexable.forEach((p) => { const v = (p[key] || '').trim().toLowerCase(); if (v) m.set(v, (m.get(v) || []).concat(p)); });
    m.forEach((list) => { if (list.length > 1) list.forEach((p) => add(rule, p.file, `Same ${label} as ${list.filter((x) => x !== p).map((x) => x.file).slice(0, 3).join(', ')}.`)); });
  };
  indexable.forEach((p) => {
    if (!p.title) add('title-missing', p.file, 'Add a <title> that says what the page offers and where.');
    if (!p.description) add('description-missing', p.file, 'Add a meta description (about 150 characters).');
    if (!p.h1.length) add('h1-missing', p.file, 'Add one <h1> heading.');
  });
  dupes('title', 'title-duplicate', 'title');
  dupes('description', 'description-duplicate', 'meta description');

  // Keyword overlap (cannibalization): compare target phrases with IDF-weighted overlap,
  // so words used everywhere (city names, "services") count less than distinctive ones.
  const brand = business && business.name;
  const phr = indexable.map((p) => ({ p, list: targetPhrases(p, brand) })).filter((x) => x.list.length);
  const df = new Map();
  phr.forEach(({ list }) => { const u = new Set(); list.forEach((x) => x.t.forEach((w) => u.add(w))); u.forEach((w) => df.set(w, (df.get(w) || 0) + 1)); });
  const N = phr.length;
  // Boilerplate title parts (the same suffix on 3+ pages, never used as the lead phrase) are not targets.
  const segPages = new Map(), leadSegs = new Set();
  phr.forEach(({ list }) => list.forEach((x) => { if (x.h1) return; segPages.set(x.key, (segPages.get(x.key) || 0) + 1); if (x.first) leadSegs.add(x.key); }));
  phr.forEach((x) => { x.list = x.list.filter((A) => A.h1 || !(segPages.get(A.key) >= 3 && !leadSegs.has(A.key))); });
  const wt = (w) => Math.log((N + 1) / ((df.get(w) || 0) + 1)) + 0.15;
  const threshold = cfg.overlap && cfg.overlap.threshold ? cfg.overlap.threshold : 0.8;
  for (let i = 0; i < phr.length; i++) for (let j = i + 1; j < phr.length; j++) {
    let best = null;
    phr[i].list.forEach((A) => phr[j].list.forEach((B) => {
      let inter = 0, uni = 0, shared = [];
      new Set([...A.t, ...B.t]).forEach((w) => { const x = wt(w); uni += x; if (A.t.has(w) && B.t.has(w)) { inter += x; shared.push(w); } });
      const score = uni ? inter / uni : 0;
      if (shared.length >= 3 && (!best || score > best.score)) best = { score, a: A.seg, b: B.seg };
    }));
    if (best && best.score >= threshold) add('keyword-overlap', phr[i].p.file, `"${best.a}" competes with ${phr[j].p.file} ("${best.b}"), ${Math.round(best.score * 100)}% overlap. Pick one page for this search.`);
  }

  // JSON-LD + NAP
  pages.forEach((p) => {
    p.jsonldErrors.forEach((e) => add('json-ld-syntax', p.file, `JSON-LD block #${e.index + 1} is invalid: ${e.message}`));
    const digitsText = p.text.replace(/\D/g, '');
    const ents = businessEntities(p.jsonldParsed);
    ents.forEach((e) => {
      const same = business && business.name && normName(e.name) === normName(business.name);
      if (same) {
        if (bizPhone && e.telephone && phoneDigits(e.telephone) !== bizPhone) add('nap-schema-mismatch', p.file, `Schema phone ${e.telephone} differs from your business phone ${business.phone}.`);
        if (bizStreet && e.street && normAddress(e.street) !== bizStreet) add('nap-schema-mismatch', p.file, `Schema street "${e.street}" differs from "${business.street}".`);
        if (bizZip && e.postalCode && String(e.postalCode).trim() !== bizZip) add('nap-schema-mismatch', p.file, `Schema ZIP ${e.postalCode} differs from ${bizZip}.`);
      }
      if (e.name && !normName(p.text).includes(normName(e.name))) add('schema-not-visible', p.file, `Schema names "${e.name}", but that name is not visible on the page.`);
      if (e.telephone && phoneDigits(e.telephone).length >= 10 && !digitsText.includes(phoneDigits(e.telephone))) add('schema-not-visible', p.file, `Schema phone ${e.telephone} is not visible on the page.`);
    });
    if (bizPhone) {
      const seen = new Set();
      findPhones(p.text).forEach((ph) => { if (ph.digits !== bizPhone && !seen.has(ph.digits)) { seen.add(ph.digits); add('nap-phone-mismatch', p.file, `Shows ${ph.raw}; your business phone is ${business.phone}.`); } });
    }
    if (bizStreet && bizStreetNum) {
      const t = p.text;
      const re = new RegExp('\\b' + bizStreetNum + '\\s+[A-Za-z][^\\n]{0,40}', 'g');
      let m; const seen = new Set();
      while ((m = re.exec(t))) {
        const cand = normAddress(m[0]);
        const firstWord = bizStreet.split(' ')[1];
        if (!firstWord || !cand.split(' ').slice(1, 3).includes(firstWord)) continue; // not our street
        if (!cand.startsWith(bizStreet) && !seen.has(cand)) { seen.add(cand); add('nap-address-mismatch', p.file, `Address written as "${m[0].trim().slice(0, 45)}"; standard form is "${business.street}".`); }
      }
    }
  });

  // AI search readiness
  const robotsFile = require('path').join(site.root, 'robots.txt');
  if (fs.existsSync(robotsFile)) {
    const txt = fs.readFileSync(robotsFile, 'utf8');
    const blocked = AI_SEARCH_BOTS.filter((b) => robotsBlocksRoot(txt, b));
    if (blocked.length) add('ai-crawler-blocked', 'robots.txt', `Blocks ${blocked.join(', ')}. Add "User-agent: ${blocked[0]}" with "Allow: /" if you want to appear in AI answers.`);
  }
  if (home && business && business.source !== 'config') {
    const ents = businessEntities(home.jsonldParsed).filter((e) => normName(e.name) === normName(business.name));
    if (ents.length && !ents.some((e) => e.sameAs.length)) add('ai-entity-links-missing', home.file, 'Add "sameAs" links to your Google Business Profile, Facebook, LinkedIn and Yelp pages in the business schema.');
  }

  const off = cfg.rules || {};
  return {
    business, siteOrigin,
    findings: findings
      .filter((f) => off[f.rule] !== 'off')
      .map((f) => (off[f.rule] === 'warn' || off[f.rule] === 'error' ? Object.assign(f, { severity: off[f.rule] }) : f)),
  };
}

module.exports = { run, RULES, robotsBlocksRoot, AI_SEARCH_BOTS };
