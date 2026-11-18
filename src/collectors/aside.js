import { spawnSync } from 'node:child_process';
import { isAllowed } from '../http.js';
import { parseDeadline } from '../dates.js';

export { parseDeadline };

// 자바스크립트로 그려지는 페이지용. 이 PC의 Aside 브라우저에서 페이지를 열고
// itemSelector에 걸리는 요소의 글자와 링크만 읽어 온다. 모델은 쓰지 않는다.
//
// 소스 설정:
//   url            열 페이지
//   itemSelector   공고 한 건에 해당하는 요소의 CSS 선택자
//   hrefPattern    (선택) 링크 주소가 이 정규식에 맞는 것만
//   textPattern    (선택) 글자가 이 정규식에 맞는 것만
//   titleLine      (선택) 요소 글자의 몇 번째 줄이 제목인지, 기본 0
//   prefixLine     (선택) 이 줄을 제목 앞에 [ ]로 붙인다(예: 게임 이름)
//   organizerLine  (선택) 몇 번째 줄이 회사명인지. 없으면 company 값을 쓴다
//   locationLine   (선택) 몇 번째 줄이 근무지인지. 줄 안에 '|'가 있으면 앞부분만 쓴다
//   waitMs         (선택) 페이지가 그려지길 기다리는 시간, 기본 3500
const MARK = '@@CAREER_FEED@@';

export function toItems(raw, source) {
  const hrefRe = source.hrefPattern ? new RegExp(source.hrefPattern) : null;
  const textRe = source.textPattern ? new RegExp(source.textPattern) : null;
  const items = [];
  for (const r of raw) {
    if (hrefRe && !hrefRe.test(r.href)) continue;
    if (textRe && !textRe.test(r.text)) continue;
    const lines = r.text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const baseTitle = lines[source.titleLine ?? 0];
    if (!baseTitle || baseTitle.length < 2) continue;
    const prefix = source.prefixLine != null ? lines[source.prefixLine] : null;
    const title = prefix ? `[${prefix}] ${baseTitle}` : baseTitle;
    if (title.length < 4) continue;
    const organizer = source.organizerLine != null ? lines[source.organizerLine] : null;
    // 공고마다 주소가 없는 사이트는 목록 페이지로 연결하고, 제목으로 구분한다.
    const hasOwnUrl = /^https?:\/\//.test(r.href) && !/#\w*$/.test(r.href) && r.href !== source.url;
    items.push({
      title: title.slice(0, 200),
      url: hasOwnUrl ? r.href : source.url,
      uid: hasOwnUrl ? undefined : `${organizer ?? ''}|${title}`,
      organizer: organizer ?? source.company ?? source.name,
      deadline: parseDeadline(r.text),
      location: source.locationLine != null && lines[source.locationLine] ? lines[source.locationLine].split('|')[0].trim() : null,
      tags: [],
      summary: lines.filter((l) => l !== baseTitle && l !== organizer && l !== prefix).join(' · ').slice(0, 200),
    });
  }
  return items;
}

export async function collect(source) {
  if (!(await isAllowed(source.url))) {
    throw new Error(`robots.txt가 막고 있거나 확인할 수 없음: ${source.url}`);
  }
  // 페이지 안에서 도는 코드에는 역슬래시를 쓰지 않는다(전달 과정에서 사라진다). 글자 정리는 여기서 한다.
  const v = 'p' + Date.now();
  const code = [
    `const ${v} = await openTab(${JSON.stringify(source.url)});`,
    `await sleep(${Number(source.waitMs ?? 3500)});`,
    `const ${v}r = await ${v}.evaluate((sel) => [...document.querySelectorAll(sel)].map((a) => ({ text: a.innerText || a.textContent || '', href: a.href || (a.querySelector('a[href]') || {}).href || '' })),${JSON.stringify(source.itemSelector)});`,
    `await closeTab(${v});`,
    `console.log(${JSON.stringify(MARK)} + JSON.stringify(${v}r));`,
  ].join(' ');
  const res = spawnSync('aside', ['repl', code], { encoding: 'utf8', timeout: 150_000, shell: false });
  if (res.error) throw new Error('aside 실행 실패: ' + res.error.message);
  const line = (res.stdout ?? '').split(/\r?\n/).find((l) => l.includes(MARK));
  if (!line) throw new Error('aside 결과 없음: ' + ((res.stderr || '') + (res.stdout || '')).replace(/\s+/g, ' ').slice(0, 200));
  return toItems(JSON.parse(line.slice(line.indexOf(MARK) + MARK.length)), source);
}
