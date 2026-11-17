// 사용법: node src/run.js --runner cloud|local [--dry-run] [--seed] [--only <소스id>]
//   --dry-run : 수집·필터만 하고 상태 저장과 게시를 하지 않는다.
//   --seed    : 지금 있는 공고를 "이미 본 것"으로만 기록하고 게시하지 않는다(첫 실행 때 도배 방지).
import { readFileSync } from 'node:fs';
import { openStore } from './store.js';
import { matchTopics, isExpired } from './filter.js';
import { post } from './discord.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);

const runner = opt('--runner') ?? 'cloud';
const dryRun = flag('--dry-run');
const seed = flag('--seed');
const only = opt('--only');
const MAX_POSTS = Number(process.env.MAX_POSTS_PER_RUN ?? 15);

const { sources } = JSON.parse(readFileSync('config/sources.json', 'utf8'));
const store = openStore(runner);
const now = new Date().toISOString();
const report = [];
const failures = [];

for (const source of sources) {
  if (!source.enabled || source.runner !== runner) continue;
  if (only && source.id !== only) continue;
  const row = { 소스: source.id, 수집: 0, 신규: 0, 통과: 0, 상태: 'ok' };
  report.push(row);
  try {
    const { collect } = await import(`./collectors/${source.type}.js`);
    const items = await collect(source);
    row.수집 = items.length;
    // 0건은 사이트 구조가 바뀌었다는 신호일 수 있으니 실패로 표시한다.
    // 공고가 원래 드문 곳은 allowEmpty로 표시해 둔다.
    if (items.length === 0 && !source.allowEmpty) { row.상태 = '0건(구조 변경 의심)'; failures.push(source.id); }
    for (const raw of items) {
      const item = { ...raw, kind: source.kind };
      if (store.has(item)) continue;
      row.신규++;
      const matched = isExpired(item) ? [] : matchTopics(item, source);
      if (matched.length) row.통과++;
      store.add({
        ...item,
        source: source.id,
        sourceName: source.name,
        kind: source.kind,
        firstSeen: now,
        matched,
        posted: seed || matched.length === 0 ? null : false,
      });
    }
  } catch (err) {
    row.상태 = '실패: ' + err.message.slice(0, 80);
    failures.push(source.id);
  }
}

console.table(report);

// 게시 대기 중인 것을 마감이 가까운 순으로 올린다. 한 번에 MAX_POSTS건까지만.
const queue = store.items
  .filter((i) => i.posted === false && !isExpired(i))
  .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));

if (dryRun || !process.env.DISCORD_WEBHOOK_URL) {
  console.log(`\n게시 대상 ${queue.length}건 (${dryRun ? '--dry-run' : '웹훅 미설정'}이라 게시하지 않음)`);
  for (const i of queue.slice(0, 40)) {
    console.log(`- [${i.kind}] ${i.title} | 마감 ${i.deadline ?? '-'} | ${i.matched.join(', ')} | ${i.url}`);
  }
  if (queue.length > 40) console.log(`  ... 외 ${queue.length - 40}건`);
} else {
  let sent = 0;
  for (const item of queue.slice(0, MAX_POSTS)) {
    try {
      await post(item);
      item.posted = now;
      sent++;
    } catch (err) {
      console.error(err.message);
      failures.push('discord');
      break;
    }
  }
  console.log(`\n게시 ${sent}건, 대기 ${queue.length - sent}건`);
}

// --dump <파일>: 이번 실행에서 새로 본 공고 전체와 통과 여부를 남긴다(필터 점검용).
const dumpPath = opt('--dump');
if (dumpPath) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(dumpPath, JSON.stringify(store.items.filter((i) => i.firstSeen === now), null, 1));
  console.log(`점검용 파일: ${dumpPath}`);
}

if (!dryRun) store.save();
if (failures.length) {
  console.error(`\n문제가 있는 소스: ${[...new Set(failures)].join(', ')}`);
  process.exitCode = 1;
}
