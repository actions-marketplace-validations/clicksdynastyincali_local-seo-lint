'use strict';
const { RULES } = require('./checks');

function color(enabled) {
  const c = (n) => (s) => (enabled ? `\x1b[${n}m${s}\x1b[0m` : s);
  return { red: c(31), yellow: c(33), green: c(32), dim: c(2), bold: c(1), cyan: c(36) };
}

function pretty(res, opts = {}) {
  const k = color(opts.color !== false);
  const out = [];
  out.push(k.bold('local-seo-lint') + k.dim(`  ${res.pages} pages scanned`));
  if (res.business) out.push(k.dim(`Business: ${res.business.name || '?'} | ${res.business.street || 'no street'} | ${res.business.phone || 'no phone'}  (from ${res.business.source})`));
  else out.push(k.yellow('No business details found. Add LocalBusiness schema to your homepage or a "business" block to .localseorc.json to enable NAP checks.'));
  out.push('');
  const byRule = new Map();
  res.findings.forEach((f) => byRule.set(f.rule, (byRule.get(f.rule) || []).concat(f)));
  const order = [...byRule.keys()].sort((a, b) => (RULES[a].severity === RULES[b].severity ? a.localeCompare(b) : RULES[a].severity === 'error' ? -1 : 1));
  const limit = opts.limit || 10;
  order.forEach((rule) => {
    const list = byRule.get(rule);
    const sev = list[0].severity === 'error' ? k.red('error') : k.yellow('warn ');
    out.push(`${sev} ${k.bold(rule)} ${k.dim('(' + list.length + ')')}  ${k.dim(RULES[rule].about)}`);
    list.slice(0, limit).forEach((f) => out.push(`   ${k.cyan(f.file)}  ${f.message}`));
    if (list.length > limit) out.push(k.dim(`   ...and ${list.length - limit} more (use --limit 0 to show all)`));
    out.push('');
  });
  const summary = `${res.errors} error${res.errors === 1 ? '' : 's'}, ${res.warnings} warning${res.warnings === 1 ? '' : 's'}`;
  out.push(res.errors ? k.red(summary) : res.warnings ? k.yellow(summary) : k.green('No problems found. ' + summary));
  return out.join('\n');
}

function github(res, prefix = '') {
  const pre = prefix && prefix !== '.' ? prefix.replace(/\\/g, '/').replace(/\/$/, '') + '/' : '';
  const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return res.findings.map((f) => `::${f.severity === 'error' ? 'error' : 'warning'} file=${esc(pre + f.file)},title=${esc(f.rule)}::${esc(f.message)}`).join('\n');
}

module.exports = { pretty, github };
