import { getText } from '../http.js';

const decode = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : null;
};

// RSS 2.0(<item>)과 Atom(<entry>)을 둘 다 읽는다.
export function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  return blocks.map((b) => {
    const atomLink = b.match(/<link[^>]*href="([^"]+)"/i);
    return {
      title: tag(b, 'title'),
      url: tag(b, 'link') || (atomLink ? atomLink[1] : null),
      date: tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated'),
      summary: (tag(b, 'description') || tag(b, 'summary') || '').slice(0, 200),
    };
  }).filter((i) => i.title && i.url);
}

export async function collect(source) {
  const cutoff = Date.now() - (source.maxAgeDays ?? 30) * 86_400_000;
  return parseFeed(await getText(source.url))
    .filter((i) => !i.date || Number.isNaN(Date.parse(i.date)) || Date.parse(i.date) >= cutoff)
    .map((i) => ({ title: i.title, url: i.url, organizer: source.name, deadline: null, tags: [], summary: i.summary }));
}
