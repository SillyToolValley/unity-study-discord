import { getText } from '../http.js';

// 목록 페이지에 심어진 JSON-LD ItemList(검색엔진용 구조화 데이터)에서 제목과 링크를 읽는다.
// source.url에 {page}가 있으면 1..pages쪽을 차례로 읽는다.
const unescape = (s) =>
  String(s).replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

export function extractItemLists(html) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node['@type'] === 'ItemList' && Array.isArray(node.itemListElement)) {
      for (const el of node.itemListElement) {
        const it = el.item && typeof el.item === 'object' ? el.item : el;
        const url = it.url ?? (typeof el.item === 'string' ? el.item : null) ?? el.url;
        const name = it.name ?? el.name;
        if (name && url) out.push({ title: unescape(name), url });
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
    const found = extractItemLists(await getText(source.url.replace('{page}', p)));
    if (found.length === 0) break;
    items.push(...found);
  }
  return items.map((i) => ({ ...i, organizer: null, deadline: null, tags: [], summary: '' }));
}
