import { getText } from '../http.js';

const clean = (s) => s.replace(/<span class="new">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

const LIST = 'https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do';

// K-Startup 모집 중인 사업 공고 목록.
export function parseList(html) {
  const items = [];
  const seen = new Set();
  const parts = html.split(/go_view\((\d+)\);/);
  for (let i = 1; i < parts.length; i += 2) {
    const id = parts[i];
    const body = parts[i + 1] ?? '';
    if (seen.has(id)) continue;
    const tit = body.match(/<p class="tit">([\s\S]*?)<\/p>/);
    if (!tit) continue;
    seen.add(id);
    const type = body.match(/<span class="flag type\d+">([\s\S]*?)<\/span>/);
    const d = body.match(/<span class="flag day">\s*D-(\d+)/);
    const meta = [...(body.split('</ul>')[0].matchAll(/<li>([\s\S]*?)<\/li>/g))].map((m) => clean(m[1]));
    items.push({
      title: clean(tit[1]),
      url: `${LIST}?schM=view&pbancSn=${id}`,
      organizer: meta[1] ?? null,
      deadline: d ? new Date(Date.now() + 9 * 3_600_000 + Number(d[1]) * 86_400_000).toISOString().slice(0, 10) : null,
      tags: type ? [clean(type[1])] : [],
      summary: meta[0] ?? '',
    });
  }
  return items;
}

export async function collect(source) {
  const items = [];
  for (let p = 1; p <= (source.pages ?? 1); p++) {
    const found = parseList(await getText(`${LIST}?page=${p}`));
    if (found.length === 0) break;
    items.push(...found);
  }
  return items;
}
