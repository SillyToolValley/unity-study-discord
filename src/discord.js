// 디스코드 웹훅으로 게시한다.
//   DISCORD_WEBHOOK_JOBS    채용 공고를 올릴 채널의 웹훅
//   DISCORD_WEBHOOK_EVENTS  해커톤·공모전·게임잼·소식을 올릴 채널의 웹훅
//   DISCORD_WEBHOOK_URL     위 둘이 없을 때 모두 여기로
// 포럼 채널 웹훅이면 DISCORD_FORUM=1을 설정한다(공고마다 글 하나가 생긴다).
export const webhookFor = (item) =>
  (item.kind === 'job' ? process.env.DISCORD_WEBHOOK_JOBS : process.env.DISCORD_WEBHOOK_EVENTS) || process.env.DISCORD_WEBHOOK_URL || null;
export const hasWebhook = () =>
  Boolean(process.env.DISCORD_WEBHOOK_URL || (process.env.DISCORD_WEBHOOK_JOBS && process.env.DISCORD_WEBHOOK_EVENTS));
const KIND = {
  hackathon: { label: '해커톤', color: 0x5865f2 },
  jam: { label: '게임잼', color: 0xeb459e },
  contest: { label: '공모전', color: 0xfee75c },
  job: { label: '채용', color: 0x57f287 },
  news: { label: '소식', color: 0x99aab5 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fmtDate = (d) => {
  const [y, m, dd] = d.split('-').map(Number);
  return `${m}월 ${dd}일(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]})`;
};

// 포럼 목록에서 글 미리보기로 보이는 한 줄: 회사 | 마감 | 걸린 조건
export function summaryLine(item) {
  const hits = (item.matched ?? []).filter((m) => m !== '전체' && m !== '국내').map((m) => (m === '무관' ? '경력 무관' : m));
  return [
    item.organizer,
    // 마감일을 못 읽은 공고가 실제로 상시 모집인지는 알 수 없어서 "미표기"로 적는다.
    item.deadline ? `마감 ${fmtDate(item.deadline)}` : item.kind === 'news' ? null : '마감일 미표기',
    hits.slice(0, 4).join(' · '),
  ].filter(Boolean).join('  |  ').slice(0, 300);
}

export function buildPayload(item) {
  const k = KIND[item.kind] ?? KIND.news;
  const fields = [];
  if (item.organizer) fields.push({ name: '주최', value: item.organizer.slice(0, 200), inline: true });
  if (item.deadline) fields.push({ name: '마감', value: item.deadline, inline: true });
  if (item.tags?.length) fields.push({ name: '분류', value: item.tags.join(', ').slice(0, 200), inline: true });
  const payload = {
    allowed_mentions: { parse: [] },
    content: summaryLine(item) || undefined,
    embeds: [{
      title: `[${k.label}] ${item.title}`.slice(0, 250),
      url: item.url,
      description: (item.summary || '').slice(0, 400) || undefined,
      color: k.color,
      fields,
      footer: { text: `출처: ${item.sourceName}` },
    }],
  };
  if (process.env.DISCORD_FORUM === '1') payload.thread_name = `[${k.label}] ${item.title}`.slice(0, 95);
  return payload;
}

export async function post(item) {
  const url = webhookFor(item);
  if (!url) throw new Error(`${item.kind} 공고를 올릴 웹훅이 설정되지 않음`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildPayload(item)),
    });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      await sleep(((body.retry_after ?? 2) + 0.5) * 1000);
      continue;
    }
    if (!res.ok) {
      const err = new Error(`디스코드 게시 실패 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    await sleep(1200);
    return;
  }
  throw new Error('디스코드 게시 실패: 요청 제한이 풀리지 않음');
}
