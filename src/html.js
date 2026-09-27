'use strict';
// Minimal, dependency-free HTML helpers. Good enough for linting static sites;
// not a full HTML5 parser.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', middot: '·', rarr: '→', larr: '←', copy: '©' };

function decode(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => (ENT[n.toLowerCase()] !== undefined ? ENT[n.toLowerCase()] : m));
}

function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const body = tag.replace(/^<\s*[a-zA-Z0-9-]+/, '').replace(/\/?>$/, '');
  let m;
  while ((m = re.exec(body))) {
    const v = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    out[m[1].toLowerCase()] = decode(v);
  }
  return out;
}

function tags(html, name) {
  const re = new RegExp('<' + name + '\\b[^>]*>', 'gi');
  return (html.match(re) || []).map(attrs);
}

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function inner(html, name) {
  const re = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>', 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function text(fragment) {
  return decode(String(fragment).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function visibleText(html) {
  const body = (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [null, html])[1];
  return text(
    stripComments(body)
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
  );
}

function parse(html) {
  html = stripComments(html);
  const metas = tags(html, 'meta');
  const meta = (key) => {
    const t = metas.find((a) => (a.name || a.property || '').toLowerCase() === key);
    return t ? (t.content || '').trim() : null;
  };
  const links = tags(html, 'link');
  const jsonld = [];
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html))) {
    const a = attrs('<script ' + m[1] + '>');
    if ((a.type || '').toLowerCase() === 'application/ld+json') jsonld.push(m[2].trim());
  }
  const titles = inner(html, 'title').map(text);
  const h1 = inner(html, 'h1').map(text);
  return {
    title: titles[0] || null,
    titleCount: titles.length,
    description: meta('description'),
    robots: (meta('robots') || '').toLowerCase(),
    canonicals: links.filter((l) => (l.rel || '').toLowerCase().split(/\s+/).includes('canonical')).map((l) => l.href || ''),
    hrefs: tags(html, 'a').map((a) => a.href).filter((h) => h !== undefined),
    h1,
    jsonld,
    text: visibleText(html),
  };
}

module.exports = { parse, decode, text };
