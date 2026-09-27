'use strict';
const fs = require('fs');
const path = require('path');
const { loadSite } = require('./site');
const { run, RULES } = require('./checks');

function loadConfig(root, file) {
  const candidates = file ? [file] : ['.localseorc.json', 'localseo.config.json'].map((f) => path.join(root, f));
  for (const f of candidates) if (fs.existsSync(f)) return Object.assign({ _file: f }, JSON.parse(fs.readFileSync(f, 'utf8')));
  return {};
}

function lint(root, options = {}) {
  const cfg = Object.assign({}, loadConfig(root, options.config), options.overrides || {});
  const ignore = [].concat(cfg.ignore || [], options.ignore || []);
  const site = loadSite(root, { ignore, sitemap: cfg.sitemap });
  const res = run(site, cfg);
  const errors = res.findings.filter((f) => f.severity === 'error').length;
  const warnings = res.findings.filter((f) => f.severity === 'warn').length;
  return Object.assign(res, { pages: site.pages.length, errors, warnings, config: cfg._file || null });
}

module.exports = { lint, RULES };
