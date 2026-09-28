'use strict';
// Name / Address / Phone helpers.

function phoneDigits(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d;
}

// US/CA-style numbers: (661) 555-0123, 661-555-0123, +1 661 555 0123, 661.555.0123
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g;

function findPhones(text) {
  return (String(text).match(PHONE_RE) || []).map((raw) => ({ raw: raw.trim(), digits: phoneDigits(raw) }));
}

const ABBR = [
  [/\bstreet\b/g, 'st'], [/\bavenue\b/g, 'ave'], [/\bav\b/g, 'ave'], [/\blane\b/g, 'ln'], [/\broad\b/g, 'rd'],
  [/\bboulevard\b/g, 'blvd'], [/\bdrive\b/g, 'dr'], [/\bhighway\b/g, 'hwy'], [/\bparkway\b/g, 'pkwy'],
  [/\bcourt\b/g, 'ct'], [/\bplace\b/g, 'pl'], [/\bcircle\b/g, 'cir'], [/\bsquare\b/g, 'sq'],
  [/\bnorth\b/g, 'n'], [/\bsouth\b/g, 's'], [/\beast\b/g, 'e'], [/\bwest\b/g, 'w'],
  [/\bsuite\b/g, 'ste'], [/\bunit\b/g, 'ste'], [/\bapartment\b/g, 'ste'], [/\bapt\b/g, 'ste'], [/#\s*/g, 'ste '], [/\bno\.?\s*(?=\d)/g, 'ste ']
];

function normAddress(s) {
  let t = String(s || '').toLowerCase();
  ABBR.forEach(([re, rep]) => { t = t.replace(re, rep); });
  return t.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normName(s) {
  return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').replace(/\b(llc|inc|co|ltd|corp|the)\b/g, '').replace(/\s+/g, ' ').trim();
}

// Pull business-like entities out of parsed JSON-LD (handles arrays and @graph).
function businessEntities(jsonldValues) {
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node['@graph']) walk(node['@graph']);
    const addr = node.address;
    const hasAddr = addr && (typeof addr === 'string' || typeof addr === 'object');
    if (node.name && (hasAddr || node.telephone)) {
      const a = Array.isArray(addr) ? addr[0] : addr;
      out.push({
        type: [].concat(node['@type'] || []).join(','),
        name: node.name,
        telephone: node.telephone || null,
        street: a && typeof a === 'object' ? a.streetAddress || null : typeof a === 'string' ? a : null,
        locality: a && typeof a === 'object' ? a.addressLocality || null : null,
        region: a && typeof a === 'object' ? a.addressRegion || null : null,
        postalCode: a && typeof a === 'object' ? a.postalCode || null : null,
        openingHours: node.openingHoursSpecification || node.openingHours || null,
        sameAs: [].concat(node.sameAs || []).filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)),
      });
    }
    Object.keys(node).forEach((k) => { if (k !== '@graph' && typeof node[k] === 'object') walk(node[k]); });
  };
  jsonldValues.forEach(walk);
  // de-duplicate identical entities found through nesting
  const seen = new Set();
  return out.filter((e) => { const k = JSON.stringify(e); if (seen.has(k)) return false; seen.add(k); return true; });
}

module.exports = { phoneDigits, findPhones, normAddress, normName, businessEntities };
