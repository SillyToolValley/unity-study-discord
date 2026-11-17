import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('config/topics.json', 'utf8'));

// 영문 키워드는 단어 단위로 찾는다("ar"가 "learn"에 걸리지 않게). 끝에 *가 있으면 앞부분만 맞으면 된다.
// 한글 키워드는 포함 여부로 찾는다.
function toRegex(keyword) {
  let k = keyword.trim().toLowerCase();
  const prefix = k.endsWith('*');
  if (prefix) k = k.slice(0, -1);
  k = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!/^[\x00-\x7f]+$/.test(k)) return new RegExp(k, 'i');
  return new RegExp(`(?<![a-z0-9])${k}${prefix ? '' : '(?![a-z0-9])'}`, 'i');
}

const compile = (words = []) => words.map((w) => ({ word: w.trim().replace(/\*$/, ''), re: toRegex(w) }));
const groups = Object.fromEntries(Object.entries(cfg.groups).map(([name, words]) => [name, compile(words)]));
const jf = cfg.jobFilter ?? {};
const MAX_YEARS = jf.maxYears ?? 3;
const seniorEx = compile(jf.seniorExclude);
const roleEx = compile(jf.roleExclude);

const hitsOf = (list, text) => [...new Set(list.filter(({ re }) => re.test(text)).map(({ word }) => word))];

// 글에서 요구 경력의 최소 연수를 찾는다. 못 찾으면 null.
//   "경력 3년 이상", "3~5년", "1-3년", "경력 2년", "5+ years", "3 years of" → 최소값
//   "5년 이하", "3년 미만" → 0 (상한만 있으면 신입도 지원 가능)
export function minYearsIn(text) {
  const mins = [];
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*(?:~|-|–)\s*\d{1,2}\s*년/g)) mins.push(+m[1]);
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*년\s*(?:이상|차|↑|\+)/g)) mins.push(+m[1]);
  for (const m of text.matchAll(/경력\s*(\d{1,2})\s*년/g)) mins.push(+m[1]);
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi)) mins.push(+m[1]);
  if (/(?<!\d)\d{1,2}\s*년\s*(?:이하|미만)/.test(text)) mins.push(0);
  return mins.length ? Math.min(...mins) : null;
}

// 채용 공고: 경력 조건과 직무 조건을 둘 다 맞아야 한다. 맞으면 걸린 이유를 돌려준다.
export function matchJob(item) {
  const title = item.title ?? '';
  const text = [title, ...(item.tags ?? []), item.summary].filter(Boolean).join(' \n ');

  if (seniorEx.some(({ re }) => re.test(title))) return [];
  if (roleEx.some(({ re }) => re.test(title))) return [];

  // 직무는 제목에서만 찾는다. 부서명·태그(예: "Development" 부서의 마케터)에 걸리지 않게.
  const roles = hitsOf(groups.role ?? [], title);
  if (roles.length === 0) return [];

  const juniorInTitle = hitsOf(groups.junior ?? [], title);
  // 경력: 제목 표기 → 채용 사이트의 경력 값 → 태그·요약 순서로 본다.
  let years = minYearsIn(title);
  if (years === null && typeof item.minYears === 'number') years = item.minYears;
  if (years === null) years = minYearsIn(text);
  let level = null;
  if (years !== null) {
    if (years <= MAX_YEARS) level = years === 0 ? '신입 가능' : `경력 ${years}년+`;
  } else {
    const junior = hitsOf(groups.junior ?? [], text);
    if (junior.length) level = junior[0];
  }
  // 제목에 신입·인턴이 직접 적혀 있으면 경력 표기와 상관없이 통과시킨다.
  if (!level && juniorInTitle.length) level = juniorInTitle[0];
  if (!level) return [];
  return [level, ...roles];
}

// 채용 공고의 근무지: 국내면 '국내', 국가 제한 없는 원격이면 '원격', 그 밖이면 null.
const lc = cfg.location ?? {};
const KOREA = compile(lc.korea);
const FOREIGN_KO = compile(lc.foreignKo);
const REMOTE = compile(lc.remote);
const REGION_OK = compile(lc.remoteRegionOk);
const HANGUL = /[가-힣]/;

const isKorea = (p) => KOREA.some(({ re }) => re.test(p)) || (HANGUL.test(p) && !FOREIGN_KO.some(({ re }) => re.test(p)));
// "Remote", "Remote - Global", "원격" 처럼 원격 표기 말고 다른 지명이 없는 경우
function isPureRemote(p) {
  if (!REMOTE.some(({ re }) => re.test(p)) && !REGION_OK.some(({ re }) => re.test(p))) return false;
  let rest = p.toLowerCase();
  for (const w of [...(lc.remote ?? []), ...(lc.remoteRegionOk ?? [])].sort((a, b) => b.length - a.length)) {
    rest = rest.split(w.toLowerCase()).join(' ');
  }
  return rest.replace(/[\s\-–—(),/:.·]+/g, '') === '';
}

export function locationOf(item, source) {
  const parts = String(item.location ?? '').split(/\s*[|;]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    if (item.remote) return '원격';
    return (source.region ?? 'kr') === 'kr' ? '국내' : null;
  }
  if (parts.some(isKorea)) return '국내';
  const others = parts.filter((p) => !isPureRemote(p));
  const anyRemote = item.remote || parts.some((p) => REMOTE.some(({ re }) => re.test(p)));
  // 원격이어도 "Remote - US", "United States, Remote"처럼 다른 나라가 붙어 있으면 그 나라 거주자 대상이라 뺀다.
  if (anyRemote && others.length === 0) return '원격';
  return null;
}

// 걸린 키워드 목록을 돌려준다. 빈 배열이면 게시하지 않는다.
export function matchTopics(item, source) {
  if (source.filter === 'all') return ['전체'];
  if ((item.kind ?? source.kind) === 'job') {
    const where = locationOf(item, source);
    if (!where) return [];
    const hits = matchJob(item);
    return hits.length ? [...hits, where] : [];
  }
  const text = [item.title, item.organizer, ...(item.tags ?? []), item.summary].filter(Boolean).join(' \n ');
  const hits = [];
  for (const g of source.topics ?? cfg.default) hits.push(...hitsOf(groups[g] ?? [], text));
  return [...new Set(hits)];
}

export const isExpired = (item, today = new Date().toISOString().slice(0, 10)) =>
  Boolean(item.deadline) && item.deadline < today;
