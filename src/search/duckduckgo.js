import * as cheerio from 'cheerio';

const SEARCH_URL = 'https://html.duckduckgo.com/html/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function unwrapDdgLink(href) {
  if (!href) return href;
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    const real = url.searchParams.get('uddg');
    return real ? decodeURIComponent(real) : href;
  } catch {
    return href;
  }
}

/**
 * Scrape DuckDuckGo's no-JS HTML results page. No API key required.
 * Returns [{ title, snippet, url }] (best-effort, top `limit` results).
 */
export async function webSearch(query, { limit = 5 } = {}) {
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: new URLSearchParams({ q: query }),
  });
  if (!res.ok) throw new Error(`DuckDuckGo search failed: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];

  $('.result').each((_, el) => {
    if (results.length >= limit) return;
    const titleEl = $(el).find('.result__a').first();
    const title = titleEl.text().trim();
    const url = unwrapDdgLink(titleEl.attr('href'));
    const snippet = $(el).find('.result__snippet').text().trim();
    if (title && url) results.push({ title, snippet, url });
  });

  return results;
}

export function formatResultsForPrompt(results) {
  if (!results.length) return '(no results found)';
  return results.map((r, i) => `${i + 1}. ${r.title} — ${r.snippet} (${r.url})`).join('\n');
}
