import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// 러너(cloud/local)마다 상태 파일을 따로 둬서 서로 덮어쓰지 않게 한다.
// 중복 판별은 모든 러너의 파일을 합쳐서 한다.
const DIR = 'data';
const fileOf = (runner) => join(DIR, `items-${runner}.json`);

const TRACKING = /^(utm_\w+|ref|ref_\w+|fbclid|gclid|source|gh_src)$/i;

export function canonicalUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    return (u.origin + u.pathname.replace(/\/+$/, '') + (u.search || '')).replace(/^http:/, 'https:');
  } catch {
    return url;
  }
}

// 조건에 안 맞은 공고는 중복 판별과 정리에 필요한 값만 남긴다(파일 크기를 줄이려고).
const slim = (i) =>
  i.matched?.length ? i : { key: i.key, titleKey: i.titleKey, title: i.title, kind: i.kind, source: i.source, deadline: i.deadline ?? null, firstSeen: i.firstSeen, matched: [], posted: i.posted ?? null };

// 공고마다 주소가 없는 사이트는 item.uid로 구분한다.
const keyOf = (item) => (item.uid ? `${canonicalUrl(item.url)}#${item.uid}` : canonicalUrl(item.url));

// 같은 공고가 다른 사이트에 올라온 경우를 잡기 위한 제목 키.
// 채용은 회사가 달라도 직무명이 같을 수 있어서 회사명을 함께 넣는다.
export const titleKey = (item) =>
  ((item.kind === 'job' ? (item.organizer ?? '') + '|' : '') + item.title)
    .toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

function load(runner) {
  const f = fileOf(runner);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { items: [] };
}

export function openStore(runner) {
  mkdirSync(DIR, { recursive: true });
  const mine = load(runner);
  const urls = new Set();
  const titles = new Set();
  // 이 러너가 기록한 공고를 주소·제목 키로 찾기 위한 표
  const ownByKey = new Map();
  const ownByTitle = new Map();
  const index = (rec) => {
    ownByKey.set(rec.key, rec);
    if (rec.titleKey?.length >= 12) ownByTitle.set(rec.titleKey, rec);
  };
  mine.items.forEach(index);
  for (const f of readdirSync(DIR).filter((n) => /^items-.+\.json$/.test(n))) {
    for (const it of JSON.parse(readFileSync(join(DIR, f), 'utf8')).items) {
      urls.add(it.key);
      titles.add(it.titleKey);
    }
  }
  return {
    items: mine.items,
    has(item) {
      const tk = titleKey(item);
      return urls.has(keyOf(item)) || (tk.length >= 12 && titles.has(tk));
    },
    // 이미 본 공고가 이번에도 목록에 있으면 마지막으로 본 날을 남긴다.
    // 마감일 없는 공고를 캘린더에서 언제 내릴지 정할 때 쓰므로, 조건을 통과한 마감일 없는 공고만 기록한다.
    touch(item, day) {
      const tk = titleKey(item);
      const rec = ownByKey.get(keyOf(item)) ?? (tk.length >= 12 ? ownByTitle.get(tk) : undefined);
      if (rec && rec.matched?.length && !rec.deadline && rec.lastSeen !== day) rec.lastSeen = day;
    },
    add(item) {
      const rec = { ...item, key: keyOf(item), titleKey: titleKey(item) };
      mine.items.push(rec);
      urls.add(rec.key);
      titles.add(rec.titleKey);
      index(rec);
      return rec;
    },
    save() {
      // 마감이 90일 넘게 지난 항목은 버려서 파일이 계속 커지지 않게 한다.
      const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
      const old = new Date(Date.now() - 365 * 86_400_000).toISOString();
      mine.items = mine.items.filter((i) => (i.deadline ? i.deadline >= cutoff : i.firstSeen >= old)).map(slim);
      // 한 줄에 한 건씩 써서 커밋 차이가 읽기 쉽게 한다.
      // 임시 파일에 다 쓴 뒤 바꿔 끼워서, 쓰는 도중 끊겨도 기존 파일이 깨지지 않게 한다.
      const f = fileOf(runner);
      writeFileSync(f + '.tmp', '{"items":[\n' + mine.items.map((i) => JSON.stringify(i)).join(',\n') + '\n]}\n');
      renameSync(f + '.tmp', f);
    },
  };
}
