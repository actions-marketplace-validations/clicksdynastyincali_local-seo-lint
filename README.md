# local-seo-lint

**Catch local SEO and AI-search mistakes before they go live.**

`local-seo-lint` scans a static website folder and flags the problems that quietly hurt local rankings: a phone number that's different on one page, schema that disagrees with the page, two pages fighting for the same search, pages Google can't find, and more.

- Zero dependencies. Node 18+.
- Works on any static site: plain HTML, Hugo, Jekyll, Eleventy, Astro, Next.js static export.
- Runs locally, in CI, or as a GitHub Action with inline annotations on pull requests.
- Nothing is sent anywhere. It only reads your files.

## Why this exists

General SEO linters check one page at a time: is there a title, is there a meta description. Local SEO problems usually live **between** pages:

- Your homepage schema says one phone number, your contact page shows another.
- The footer says "Suite 4" on most pages and leaves it out on one.
- Four pages all target "Bakersfield digital marketing agency", so Google splits the credit and none of them rank.
- A new landing page was never linked from anywhere, so Google never finds it.

We built this at [Clicks Dynasty](https://www.clicksdynasty.com), a local SEO agency, after finding exactly these problems on real sites, including our own. Running it against an older version of our site flagged the four pages that were all competing for "Bakersfield digital marketing agency", the same problem we had found by hand.

## Quick start

```bash
# Run straight from GitHub, no install
npx github:clicksdynastyincali/local-seo-lint ./my-site

# Or clone and run
git clone https://github.com/clicksdynastyincali/local-seo-lint.git
node local-seo-lint/bin/local-seo-lint.js ./my-site
```

Point it at the folder that contains your HTML files (for generated sites, the build output such as `public/` or `dist/`).

### Example output

```text
local-seo-lint  5 pages scanned
Business: Oak Street Plumbing | 123 Example Ave, Suite 4 | +1-661-555-0123  (from schema on index.html)

error broken-link (1)  Internal link points to a page that does not exist.
   index.html  Link to "pricing.html" goes nowhere.

error json-ld-syntax (1)  JSON-LD blocks must be valid JSON, or search engines ignore them.
   services.html  JSON-LD block #1 is invalid: Expected double-quoted property name in JSON at position 77 (line 1 column 78)

error nap-schema-mismatch (1)  Business schema on a page disagrees with your business name, address or phone.
   contact.html  Schema phone +1-661-555-0100 differs from your business phone +1-661-555-0123.

error sitemap-dead-url (1)  sitemap.xml lists a URL with no matching page.
   sitemap.xml  Lists https://www.example.com/deleted-page.html, but no such page exists.

warn  canonical-missing (1)  Page has no canonical tag.
   contact.html  Add <link rel="canonical" href="https://www.example.com/contact.html">.

warn  description-duplicate (2)  Several pages share the same meta description.
   drain-cleaning-bakersfield.html  Same meta description as services.html.
   services.html  Same meta description as drain-cleaning-bakersfield.html.

warn  keyword-overlap (1)  Two pages target nearly the same search, so they compete with each other.
   drain-cleaning-bakersfield.html  "Drain Cleaning Services in Bakersfield" competes with services.html ("Drain Cleaning Services in Bakersfield"), 100% overlap. Pick one page for this search.

warn  nap-address-mismatch (1)  Your address is written differently on this page.
   contact.html  Address written as "123 Example Ave, Bakersfield anytime. Oak Str"; standard form is "123 Example Ave, Suite 4".

warn  nap-phone-mismatch (1)  A phone number on the page differs from your business phone.
   services.html  Shows (661) 555-0199; your business phone is +1-661-555-0123.

warn  orphan-page (1)  No other page links here, so crawlers struggle to find it.
   drain-cleaning-bakersfield.html  No other page links to this page.

warn  schema-not-visible (1)  Schema says something the visitor cannot see on the page.
   contact.html  Schema phone +1-661-555-0100 is not visible on the page.

warn  sitemap-page-missing (1)  Indexable page is not listed in sitemap.xml.
   drain-cleaning-bakersfield.html  Not listed in sitemap.xml.

warn  title-duplicate (2)  Several pages share the same title.
   drain-cleaning-bakersfield.html  Same title as services.html.
   services.html  Same title as drain-cleaning-bakersfield.html.

4 errors, 11 warnings
```

This is the output for the small demo site in [`test/fixtures/site`](test/fixtures/site).

## What it checks

| Rule | Default | What it catches |
|---|---|---|
| `nap-schema-mismatch` | error | Business schema on a page has a different phone, street or ZIP than your business |
| `nap-phone-mismatch` | warn | A phone number shown on a page isn't your business number |
| `nap-address-mismatch` | warn | Your street address is written differently (knows that "Avenue #4" = "Ave, Suite 4") |
| `schema-not-visible` | warn | Schema claims a name or phone that visitors can't see on the page |
| `json-ld-syntax` | error | A JSON-LD block is invalid JSON, so search engines ignore it |
| `keyword-overlap` | warn | Two pages target nearly the same search (keyword cannibalization) |
| `orphan-page` | warn | No other page links to this page |
| `broken-link` | error | Internal link to a page or file that doesn't exist |
| `sitemap-page-missing` | warn | Indexable page not listed in `sitemap.xml` |
| `sitemap-dead-url` | error | `sitemap.xml` lists a page that doesn't exist |
| `sitemap-noindex` | error | `sitemap.xml` lists a page marked `noindex` |
| `sitemap-missing` | warn | No `sitemap.xml` at all |
| `canonical-missing` | warn | Page has no canonical tag |
| `canonical-multiple` | error | More than one canonical tag |
| `canonical-relative` | warn | Canonical URL isn't absolute |
| `canonical-other-page` | warn | Canonical points to a different page (so this one won't rank) |
| `canonical-broken` | error | Canonical points to a page that doesn't exist |
| `title-missing` / `title-duplicate` | error / warn | Missing or repeated `<title>` |
| `description-missing` / `description-duplicate` | warn | Missing or repeated meta description |
| `h1-missing` | warn | Page has no `<h1>` |
| `ai-crawler-blocked` | error | `robots.txt` blocks an AI search crawler (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot, Bingbot, Applebot), so the business can't appear in AI answers |
| `ai-entity-links-missing` | warn | Homepage business schema has no `sameAs` links (Google Business Profile, Facebook, LinkedIn, Yelp), so AI tools can't confirm which business it is |

Pages marked `noindex`, `404.html`, and pages that are 301-redirected in `.htaccess` or `_redirects` are skipped where it makes sense.

### How business details are found

NAP checks compare every page against one "source of truth":

1. The `business` block in `.localseorc.json`, if you have one, or
2. The first LocalBusiness/Organization schema with an address or phone on your homepage.

### How keyword overlap works

Each page's "target phrases" are its title segments (split on `|`, `-`, `:`) plus its `<h1>`, with your brand name removed. Phrases are compared using overlap weighted by how rare each word is on your site, so words used everywhere (your city, "services") count less than distinctive ones. A title suffix repeated on many pages (like "| Bakersfield & Central Valley, CA") is treated as boilerplate, not a target.

## Configuration

Optional. Create `.localseorc.json` in your site folder:

```json
{
  "siteUrl": "https://www.example.com",
  "business": {
    "name": "Oak Street Plumbing",
    "phone": "+1-661-555-0123",
    "address": { "street": "123 Example Ave, Suite 4", "postalCode": "93301" }
  },
  "ignore": ["drafts/**", "backup/**"],
  "overlap": { "threshold": 0.8 },
  "rules": {
    "description-duplicate": "off",
    "orphan-page": "error"
  }
}
```

Every rule can be set to `"off"`, `"warn"` or `"error"`.

## CLI options

```text
Usage: local-seo-lint [folder] [options]

Checks a static website folder for local SEO problems.

Options:
  --config <file>        Config file (default: .localseorc.json in the folder)
  --ignore <glob>        Skip files/folders (repeatable), e.g. --ignore "drafts/**"
  --format <pretty|json|github>   Output format (default: pretty)
  --limit <n>            Max findings shown per rule in pretty output (0 = all, default 10)
  --max-warnings <n>     Fail if there are more than n warnings (default: no limit)
  --no-color             Disable colors
  --no-footer            Hide the "need help?" line under the results
  -h, --help             Show this help
  -v, --version          Show version

Exit code: 1 if any errors (or too many warnings), otherwise 0.
```

## GitHub Action

Add [`examples/local-seo-lint.yml`](examples/local-seo-lint.yml) to `.github/workflows/` in your website repository:

```yaml
# Save as .github/workflows/local-seo-lint.yml in your website repository.
name: Local SEO Lint
on:
  push:
  pull_request:
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: clicksdynastyincali/local-seo-lint@main
        with:
          path: .            # or your build output folder, e.g. public/ or dist/
          ignore: "drafts/**"
```

Problems appear as annotations on the changed files in pull requests, and errors fail the check.

### AI search checks

More customers now ask ChatGPT and Perplexity to recommend local businesses. In our [California AI Visibility Index](https://www.clicksdynasty.com/california-ai-visibility-index.html), the two tools agreed on only about 1 in 4 of the businesses they recommended. Two things on your own site decide whether you can show up at all:

- **Crawler access.** If `robots.txt` blocks the crawlers that fetch pages for AI answers, those tools can't read your site. Blocking *training* crawlers such as `GPTBot` or `ClaudeBot` is your choice and is not flagged.
- **Entity links.** `sameAs` links in your business schema tie your website to your Google, Yelp and social profiles, which is how AI tools check they have the right business.

## Limitations

- Built for static HTML. It does not run JavaScript, so content injected client-side isn't seen.
- Phone detection is tuned for US/Canada formats.
- It checks your own files, not third-party listings (Google Business Profile, Yelp and so on).
- Redirect detection understands simple `.htaccess` `Redirect`/`RewriteRule [R=301]` lines and Netlify-style `_redirects`; complex regex rules are ignored.

## Roadmap

- Opening-hours consistency between schema and visible text
- Compare site details with a Google Business Profile export
- Near-duplicate location page detection (doorway pages)
- International phone formats

Issues and pull requests are welcome.

## For agencies

Running this on client sites and finding more than your team has time to fix? [Clicks Dynasty](https://www.clicksdynasty.com) fixes local SEO and AI-visibility issues white-label, under your brand, and never contacts your clients. [Book a free call](https://www.clicksdynasty.com/book.html?service=strategy).

## Development

```bash
npm test
```

## License

MIT. Built by [Clicks Dynasty](https://www.clicksdynasty.com), a local SEO and digital marketing agency in Bakersfield, California.
