// 수집 기록으로 마감 캘린더 페이지와 구독용 캘린더 파일을 만든다.
// 사용법: node src/calendar.js [출력 폴더, 기본 site]
//   index.html    달력·목록 페이지
//   calendar.ics  전체, jobs.ics 채용만, events.ics 대외활동만(해커톤·공모전·게임잼)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { kstDate, validDate } from './dates.js';
import { isStaleUndated } from './filter.js';

const OUT = process.argv[2] ?? 'site';
const KIND = { job: '채용', hackathon: '해커톤', contest: '공모전', jam: '게임잼' };
const now = new Date();
const today = kstDate(now.getTime()); // 한국 날짜

// 조건을 통과했고 마감이 지나지 않은 공고만 쓴다. 소식(news)은 마감이 없어 뺀다.
// 마감일이 없는 공고는 목록에서 마지막으로 본 뒤 며칠이 지나면 끝난 것으로 보고 뺀다.
export function loadItems(dir = 'data') {
  const items = [];
  for (const f of readdirSync(dir).filter((n) => /^items-.+\.json$/.test(n))) {
    for (const raw of JSON.parse(readFileSync(join(dir, f), 'utf8')).items) {
      if (!raw.matched?.length || !KIND[raw.kind]) continue;
      // 날짜가 이상한 값이면 마감일 없음으로 다룬다(.ics 생성이 통째로 실패하지 않게).
      const it = validDate(raw.deadline) ? raw : { ...raw, deadline: null };
      if (it.deadline && it.deadline < today) continue;
      if (isStaleUndated(it, today)) continue;
      items.push(it);
    }
  }
  return items.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.title.localeCompare(b.title));
}

// ---- .ics ----
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// 한 줄이 75바이트를 넘으면 접는다. 한글이 중간에 잘리지 않게 글자 단위로 센다.
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stamp = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15) + 'Z';
const nextDay = (d) => new Date(Date.parse(d + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');

export function buildIcs(items, name) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//career-feed-bot//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    'X-WR-TIMEZONE:Asia/Seoul',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const it of items) {
    if (!it.deadline) continue;
    const desc = [
      it.organizer && `주최: ${it.organizer}`,
      `분류: ${it.matched.filter((m) => m !== '전체').join(', ') || KIND[it.kind]}`,
      `출처: ${it.sourceName ?? it.source}`,
      it.url,
    ].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${createHash('sha1').update(it.key ?? it.url).digest('hex').slice(0, 20)}@career-feed-bot`,
      `DTSTAMP:${stamp(it.firstSeen ?? now.toISOString())}`,
      `DTSTART;VALUE=DATE:${it.deadline.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${nextDay(it.deadline)}`,
      `SUMMARY:${esc(`[${KIND[it.kind]} 마감] ${it.title}`)}`,
      `DESCRIPTION:${esc(desc)}`,
      `URL:${it.url}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ---- 페이지 ----
export function buildPage(items) {
  const rows = items.map((i) => ({
    t: i.title,
    u: i.url,
    o: i.organizer ?? '',
    d: i.deadline ?? null,
    k: i.kind,
    // 채용은 모두 국내·원격이라 '국내'는 빼고, 짧은 경력 표기는 풀어 쓴다.
    m: i.matched.filter((m) => m !== '전체' && m !== '국내').map((m) => (m === '무관' ? '경력 무관' : m)),
    s: i.sourceName ?? i.source,
    n: (i.firstSeen ?? '').slice(0, 10),
  }));
  const data = JSON.stringify({ updated: now.toISOString(), items: rows }).replace(/</g, '\\u003c');
  return readFileSync(new URL('./calendar.html', import.meta.url), 'utf8').replace('__CALENDAR_DATA__', () => data);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('src/calendar.js')) {
  const items = loadItems();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'index.html'), buildPage(items));
  writeFileSync(join(OUT, 'calendar.ics'), buildIcs(items, '커리어 마감 캘린더'));
  writeFileSync(join(OUT, 'jobs.ics'), buildIcs(items.filter((i) => i.kind === 'job'), '커리어 마감 캘린더 · 채용'));
  writeFileSync(join(OUT, 'events.ics'), buildIcs(items.filter((i) => i.kind !== 'job'), '커리어 마감 캘린더 · 대외활동'));
  writeFileSync(join(OUT, '.nojekyll'), '');
  const counts = Object.fromEntries(Object.keys(KIND).map((k) => [KIND[k], items.filter((i) => i.kind === k).length]));
  console.log(`캘린더 생성: ${items.length}건 (마감일 있음 ${items.filter((i) => i.deadline).length}건)`, counts, '→', OUT);
}
