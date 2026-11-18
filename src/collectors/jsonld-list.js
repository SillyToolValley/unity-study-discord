import { getText } from '../http.js';
import { parseDeadline, validDate } from '../dates.js';

// 목록 페이지에 심어진 JSON-LD ItemList(검색엔진용 구조화 데이터)에서 제목과 링크를 읽는다.
// source.url에 {page}가 있으면 1..pages쪽을 차례로 읽는다.
// 목록에는 보통 마감일이 없어서, 항목의 endDate가 있으면 쓰고 없으면 제목의 "(~11/28)" 같은 표기에서 읽는다.
const unescape = (s) =>
  String(s).replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

// 사이트 메뉴(SiteNavigationElement)는 공고가 아니라서 뺀다.
const NOT_ITEM = /SiteNavigationElement|BreadcrumbList/i;

export function extractItemLists(html, pageUrl) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node['@type'] === 'ItemList' && Array.isArray(node.itemListElement)) {
      for (const el of node.itemListElement) {
        const it = el.item && typeof el.item === 'object' ? el.item : el;
        if (NOT_ITEM.test(String(el['@type'] ?? '')) || NOT_ITEM.test(String(it['@type'] ?? ''))) continue;
        const url = it.url ?? (typeof el.item === 'string' ? el.item : null) ?? el.url;
        const name = it.name ?? el.name;
        if (!name || !url) continue;
        let abs;
        try { abs = new URL(url, pageUrl).href; } catch { continue; }
        const end = String(it.endDate ?? it.validThrough ?? '').slice(0, 10);
        out.push({ title: unescape(name), url: abs, deadline: validDate(end) ? end : null });
      }
    }
    Object.values(node).forEach(walk);
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1])); } catch { /* 깨진 블록은 건너뜀 */ }
  }
  return out;
}

export async function collect(source) {
  const pages = source.url.includes('{page}') ? (source.pages ?? 1) : 1;
  const items = [];
  for (let p = 1; p <= pages; p++) {
    const url = source.url.replace('{page}', p);
    const found = extractItemLists(await getText(url), url);
    if (found.length === 0) break;
    items.push(...found);
  }
  return items.map((i) => ({ ...i, organizer: null, deadline: i.deadline ?? parseDeadline(i.title), tags: [], summary: '' }));
}
