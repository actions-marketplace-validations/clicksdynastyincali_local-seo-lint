'use strict';
const fs = require('fs');
const path = require('path');
const { parse } = require('./html');

const DEFAULT_IGNORE = ['node_modules/**', '.git/**', '**/node_modules/**'];

function globToRe(g) {
  g = String(g).replace(/^\.\//, '').replace(/\/$/, '');
  let s = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { if (g[i + 2] === '/') { s += '(?:.*/)?'; i += 2; } else { s += '.*'; i += 1; } }
    else if (c === '*') s += '[^/]*';
    else if (c === '?') s += '[^/]';
    else s += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + s + '(?:/.*)?$');
}

function walk(dir, root, ignoreRes, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (ignoreRes.some((re) => re.test(rel))) continue;
    if (ent.isDirectory()) walk(abs, root, ignoreRes, out);
    else if (/\.html?$/i.test(ent.name)) out.push(rel);
  }
  return out;
}

function urlPathFor(rel) {
  if (/(^|\/)index\.html?$/i.test(rel)) return '/' + rel.replace(/index\.html?$/i, '');
  return '/' + rel;
}

function loadSite(root, opts = {}) {
  const ignore = DEFAULT_IGNORE.concat(opts.ignore || []);
  const files = walk(root, root, ignore.map(globToRe), []).sort();
  const pages = files.map((rel) => {
    const html = fs.readFileSync(path.join(root, rel), 'utf8');
    const p = parse(html);
    p.file = rel;
    p.urlPath = urlPathFor(rel);
    p.noindex = /\bnoindex\b/.test(p.robots);
    p.jsonldParsed = [];
    p.jsonldErrors = [];
    p.jsonld.forEach((raw, i) => {
      try { p.jsonldParsed.push(JSON.parse(raw)); } catch (e) { p.jsonldErrors.push({ index: i, message: e.message }); }
    });
    return p;
  });
  const byPath = new Map();
  pages.forEach((p) => {
    byPath.set(p.urlPath, p);
    if (p.urlPath.endsWith('/') && p.urlPath !== '/') byPath.set(p.urlPath.slice(0, -1), p);
  });
  // Pages that are 301-redirected elsewhere (Apache .htaccess or Netlify/Cloudflare _redirects) are skipped.
  const redirected = new Set();
  const addRedirect = (from) => { const f = String(from).replace(/^\^?\/?/, '/').replace(/\$$/, '').replace(/\\\./g, '.'); if (!/[*()[\]|+?]/.test(f)) redirected.add(f.toLowerCase()); };
  const ht = path.join(root, '.htaccess');
  if (fs.existsSync(ht)) fs.readFileSync(ht, 'utf8').split(/\r?\n/).forEach((line) => {
    const l = line.trim(); let m;
    if ((m = l.match(/^Redirect(?:Permanent|\s+(?:301|permanent))?\s+(\S+)\s+\S+/i))) addRedirect(m[1]);
    else if ((m = l.match(/^RewriteRule\s+(\S+)\s+\S+\s+\[[^\]]*R=30[18][^\]]*\]/i))) addRedirect(m[1]);
  });
  const rd = path.join(root, '_redirects');
  if (fs.existsSync(rd)) fs.readFileSync(rd, 'utf8').split(/\r?\n/).forEach((line) => { const m = line.trim().match(/^(\/\S+)\s+\S+\s*(30[18])?/); if (m && !line.trim().startsWith('#')) addRedirect(m[1]); });
  pages.forEach((p) => { p.redirected = redirected.has(p.urlPath.toLowerCase()); });

  let sitemap = null;
  const smPath = path.join(root, opts.sitemap || 'sitemap.xml');
  if (fs.existsSync(smPath)) {
    const xml = fs.readFileSync(smPath, 'utf8');
    sitemap = { file: path.relative(root, smPath).split(path.sep).join('/'), urls: (xml.match(/<loc>\s*([^<]+?)\s*<\/loc>/gi) || []).map((l) => l.replace(/<\/?loc>/gi, '').trim()) };
  }
  return { root, pages, byPath, sitemap, redirected };
}

module.exports = { loadSite, globToRe };
