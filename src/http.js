// 공통 HTTP: 정직한 User-Agent, 호스트별 지연, robots.txt 확인.
export const USER_AGENT = 'career-feed-bot/0.1 (study community notice bot)';
const UA_TOKEN = 'career-feed-bot';
const DELAY_MS = 1500;

const lastHit = new Map();
const robotsCache = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rawFetch(url, opts = {}) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
  return fetch(url, {
    ...opts,
    headers: { 'user-agent': USER_AGENT, accept: '*/*', ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
}

// robots.txt를 그룹별 규칙으로 파싱한다.
export function parseRobots(text) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && cur) {
      if (val) cur.rules.push({ allow: key === 'allow', path: val });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function ruleMatches(rulePath, path) {
  const re = new RegExp(
    '^' + rulePath.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'),
  );
  return re.test(path);
}

export function robotsAllows(groups, path) {
  const own = groups.filter((g) => g.agents.includes(UA_TOKEN));
  const use = own.length ? own : groups.filter((g) => g.agents.includes('*'));
  let best = null;
  for (const g of use) {
    for (const r of g.rules) {
      if (!ruleMatches(r.path, path)) continue;
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
  }
  return best ? best.allow : true;
}

// robots.txt가 허용하는지 확인한다. 못 읽으면(네트워크 오류, 5xx) 막힌 것으로 본다.
export async function isAllowed(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let groups = null;
    try {
      const res = await rawFetch(u.origin + '/robots.txt');
      if (res.ok) groups = parseRobots(await res.text());
      else if (res.status >= 400 && res.status < 500) groups = [];
    } catch { /* groups stays null */ }
    robotsCache.set(u.origin, groups);
  }
  const groups = robotsCache.get(u.origin);
  if (groups === null) return false;
  return robotsAllows(groups, u.pathname + u.search);
}

export async function get(url, { skipRobots = false } = {}) {
  if (!skipRobots && !(await isAllowed(url))) {
    throw new Error(`robots.txt가 막고 있거나 확인할 수 없음: ${url}`);
  }
  const res = await rawFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res;
}

// 목록 조회를 POST로만 받는 사이트용. 조회 전용 요청에만 쓴다.
export async function postJson(url, body, { skipRobots = false } = {}) {
  if (!skipRobots && !(await isAllowed(url))) {
    throw new Error(`robots.txt가 막고 있거나 확인할 수 없음: ${url}`);
  }
  const res = await rawFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

export const getText = async (url, o) => (await get(url, o)).text();
export const getJson = async (url, o) => (await get(url, o)).json();
