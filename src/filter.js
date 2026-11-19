import { readFileSync } from 'node:fs';
import { kstDate, addDays } from './dates.js';

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
const PLANNING_ROLES = new Set(jf.planningRoles ?? []);
const planningCtx = compile(jf.planningContext);
const ENGINEER_ROLES = new Set(jf.engineerRoles ?? []);
const engineerCtx = compile(jf.engineerContext);
const AI_ROLES = new Set(jf.aiRoles ?? []);
const aiCtx = compile(jf.aiContext);
const anyHit = (list, text) => list.some(({ re }) => re.test(text));

// '엔지니어'나 'AI' 한 단어로만 직무가 걸린 경우, 제목에 맞는 맥락이 있어야 개발 직무로 본다.
//   엔지니어만: 소프트웨어·데이터·AI·게임 쪽 단어 필요(반도체 공정·네트워크 엔지니어 등은 뺀다)
//   AI만: 엔지니어·개발·연구·기획 같은 직무 단어 필요("AI활용" 디자이너, "AI 리스크 분석" 등은 뺀다)
//   둘 다(예: AI Engineer): 통과
function genericRoleOk(roles, title) {
  const generic = roles.every((r) => ENGINEER_ROLES.has(r) || AI_ROLES.has(r));
  if (!generic) return true;
  const eng = roles.some((r) => ENGINEER_ROLES.has(r));
  const ai = roles.some((r) => AI_ROLES.has(r));
  if (eng && ai) return true;
  if (eng) return anyHit(engineerCtx, title);
  return anyHit(aiCtx, title);
}

const hitsOf = (list, text) => [...new Set(list.filter(({ re }) => re.test(text)).map(({ word }) => word))];

// 글에서 요구 경력의 최소 연수를 찾는다. 못 찾으면 null.
//   "경력 3년 이상", "3~5년", "1-3년", "경력 2년", "5+ years", "3 years of" → 최소값
//   "5년 이하", "3년 미만" → 0 (상한만 있으면 신입도 지원 가능)
//   "2-5 years", "1 to 3 years" → 앞쪽 값
export function minYearsIn(text) {
  const mins = [];
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*(?:~|-|–)\s*\d{1,2}\s*년/g)) mins.push(+m[1]);
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*년\s*(?:이상|차|↑|\+)/g)) mins.push(+m[1]);
  for (const m of text.matchAll(/경력\s*(\d{1,2})\s*년/g)) mins.push(+m[1]);
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s*(?:~|-|–|to)\s*\d{1,2}\s*\+?\s*(?:years?|yrs?)\b/gi)) mins.push(+m[1]);
  // 범위의 뒤쪽 숫자("2-5 years"의 5)는 따로 세지 않는다.
  for (const m of text.matchAll(/(?<!\d\s*(?:~|-|–|to)\s*)(?<!\d)(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi)) mins.push(+m[1]);
  if (/(?<!\d)\d{1,2}\s*년\s*(?:이하|미만)/.test(text)) mins.push(0);
  return mins.length ? Math.min(...mins) : null;
}

// 제목 앞에 붙은 회사명("DeepAuto.ai｜…", "[회사] …")을 뗀다.
// 회사명의 "ai", "바이오" 같은 글자가 직무·제외 조건에 걸리지 않게 하려는 것이다.
export function stripOrganizer(title, organizer) {
  const org = String(organizer ?? '').trim();
  if (org.length < 2) return title;
  const e = org.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rest = title.replace(new RegExp(`^\\s*(?:\\[\\s*${e}\\s*\\]|\\(\\s*${e}\\s*\\)|${e}\\s*[｜|:·–—-])\\s*`, 'i'), '');
  return rest.trim() ? rest : title;
}

// "학력 무관", "나이 무관"의 '무관'이 경력 무관으로 잡히지 않게 지운다.
const NOT_CAREER_MUGWAN = /(학력|나이|연령|성별|전공|지역|국적)\s*(?:[·/,]\s*(?:학력|나이|연령|성별|전공|지역|국적)\s*)*무관/g;

// 채용 공고: 경력 조건과 직무 조건을 둘 다 맞아야 한다. 맞으면 걸린 이유를 돌려준다.
export function matchJob(item) {
  const title = stripOrganizer(item.title ?? '', item.organizer).replace(NOT_CAREER_MUGWAN, ' ');
  const text = [title, ...(item.tags ?? []), item.summary].filter(Boolean).join(' \n ').replace(NOT_CAREER_MUGWAN, ' ');

  if (seniorEx.some(({ re }) => re.test(title))) return [];
  if (roleEx.some(({ re }) => re.test(title))) return [];

  // 직무는 제목에서만 찾는다. 부서명·태그(예: "Development" 부서의 마케터)에 걸리지 않게.
  const roles = hitsOf(groups.role ?? [], title);
  if (roles.length === 0) return [];
  // 기획으로만 걸렸으면 게임·엔진·AI 관련 기획일 때만 통과시킨다(전략기획·웹기획 등은 뺀다).
  if (roles.every((r) => PLANNING_ROLES.has(r)) && !planningCtx.some(({ re }) => re.test(title))) return [];
  if (!genericRoleOk(roles, title)) return [];

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

// 한글 근무지는 국내로 보되, 다른 나라 이름(한글·영문)이 함께 있으면 뺀다. 예: "재택 (US only)"
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

// 마감이 지났는지는 한국 날짜로 판단한다(실행이 밀려 한국 시간 자정을 넘겨도 어제 마감을 올리지 않게).
export const isExpired = (item, today = kstDate()) =>
  Boolean(item.deadline) && item.deadline < today;

// 마감일이 없는 공고는 목록에서 마지막으로 본 뒤 이 기간이 지나면 끝난 것으로 본다(캘린더에서 내림).
export const UNDATED_KEEP_DAYS = 10;
export const isStaleUndated = (item, today = kstDate()) =>
  !item.deadline && String(item.lastSeen ?? item.firstSeen ?? '').slice(0, 10) < addDays(today, -UNDATED_KEEP_DAYS);
