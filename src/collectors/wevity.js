import { getText } from '../http.js';

const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

// 위비티 분야별 목록. source.cidx = 분야 번호, source.pages = 읽을 쪽수.
export function parseList(html, baseUrl) {
  const items = [];
  for (const li of html.split(/<li[\s>]/).slice(1)) {
    const a = li.match(/<div class="tit">\s*<a href="([^"]+)">([\s\S]*?)<\/a>/);
    if (!a) continue;
    const ix = a[1].match(/ix=(\d+)/);
    if (!ix) continue;
    const organ = li.match(/<div class="organ">([\s\S]*?)<\/div>/);
    const day = li.match(/<div class="day">([\s\S]*?)<\/div>/);
    const dayText = day ? clean(day[1]) : '';
    const d = dayText.match(/D-(\d+)/);
    let deadline = null;
    if (d) deadline = new Date(Date.now() + 9 * 3_600_000 + Number(d[1]) * 86_400_000).toISOString().slice(0, 10);
    else if (/D-day/i.test(dayText)) deadline = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    else if (/마감|D\+/.test(dayText)) continue; // 이미 끝난 공모전
    const field = li.match(/<div class="sub-tit">([\s\S]*?)<\/div>/);
    items.push({
      title: clean(a[2]),
      url: `${baseUrl}?c=find&s=1&gbn=view&ix=${ix[1]}`,
      organizer: organ ? clean(organ[1]) : null,
      deadline,
      tags: field ? [clean(field[1]).replace(/^분야\s*:\s*/, '')] : [],
      summary: dayText,
    });
  }
  return items;
}

export async function collect(source) {
  const base = 'https://www.wevity.com/';
  const items = [];
  for (let p = 1; p <= (source.pages ?? 1); p++) {
    const found = parseList(await getText(`${base}?c=find&s=1&gub=1&cidx=${source.cidx}&gp=${p}`), base);
    if (found.length === 0) break;
    items.push(...found);
  }
  return items;
}
