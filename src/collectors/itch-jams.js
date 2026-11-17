import { getText } from '../http.js';

// itch.io/jams 페이지에 심어진 달력 JSON에서 게임잼 목록을 읽는다.
export function extractJams(html) {
  const marker = 'R.Jam.FilteredJamCalendar(';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('itch.io 페이지 구조가 바뀜: 달력 데이터를 찾지 못함');
  const from = start + marker.length;
  // 중괄호 짝을 맞춰 JSON 객체의 끝을 찾는다.
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { end = i + 1; break; }
  }
  if (end < 0) throw new Error('itch.io 달력 데이터의 끝을 찾지 못함');
  return JSON.parse(html.slice(from, end)).jams ?? [];
}

export async function collect(source) {
  const jams = extractJams(await getText('https://itch.io/jams'));
  const min = source.minJoined ?? 0;
  return jams
    .filter((j) => j.featured || (j.joined ?? 0) >= min)
    .map((j) => ({
      title: j.title,
      url: 'https://itch.io' + j.url,
      organizer: null,
      starts: j.start_date ? j.start_date.slice(0, 10) : null,
      deadline: j.end_date ? j.end_date.slice(0, 10) : null,
      tags: ['게임잼', j.ranked ? 'ranked' : null, j.no_ai ? 'AI 사용 금지' : null].filter(Boolean),
      summary: [j.short_text, `${j.start_date?.slice(0, 10)} ~ ${j.end_date?.slice(0, 10)}`, `${j.joined ?? 0}명 참가`]
        .filter(Boolean).join(' · '),
    }));
}
