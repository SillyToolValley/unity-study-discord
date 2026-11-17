import { getJson } from '../http.js';

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// "Oct 30 - Dec 04, 2026", "Nov 01 - 30, 2026", "Dec 20, 2026 - Jan 05, 2027" → 마감일(ISO 날짜)
export function parseEndDate(s) {
  if (!s) return null;
  const parts = s.split(' - ');
  const end = parts[parts.length - 1].trim();
  let m = end.match(/^([A-Za-z]{3})\w*\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) {
    const d = end.match(/^(\d{1,2}),\s*(\d{4})$/);
    const mon = parts[0].match(/^([A-Za-z]{3})/);
    if (!d || !mon) return null;
    m = [null, mon[1], d[1], d[2]];
  }
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;
  return new Date(Date.UTC(+m[3], month, +m[2])).toISOString().slice(0, 10);
}

export async function collect(source) {
  const items = [];
  for (let page = 1; page <= (source.maxPages ?? 10); page++) {
    const data = await getJson(
      `https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&page=${page}`,
    );
    const list = data.hackathons ?? [];
    for (const h of list) {
      if (h.invite_only) continue;
      // 참가 등록이 적은 소규모·테스트 행사는 거른다.
      if ((h.registrations_count ?? 0) < (source.minRegistrations ?? 0)) continue;
      items.push({
        title: h.title,
        url: h.url,
        organizer: h.organization_name ?? null,
        deadline: parseEndDate(h.submission_period_dates),
        tags: (h.themes ?? []).map((t) => t.name),
        summary: [
          h.submission_period_dates,
          h.displayed_location?.location,
          h.prize_amount ? '상금 ' + h.prize_amount.replace(/<[^>]+>/g, '') : null,
        ].filter(Boolean).join(' · '),
      });
    }
    if (list.length === 0 || page * (data.meta?.per_page ?? 9) >= (data.meta?.total_count ?? 0)) break;
  }
  return items;
}
