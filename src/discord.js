// 디스코드 웹훅으로 게시한다. DISCORD_WEBHOOK_URL이 없으면 게시하지 않는다.
// 포럼 채널 웹훅이면 DISCORD_FORUM=1을 설정한다(공고마다 글 하나가 생긴다).
const KIND = {
  hackathon: { label: '해커톤', color: 0x5865f2 },
  jam: { label: '게임잼', color: 0xeb459e },
  contest: { label: '공모전', color: 0xfee75c },
  job: { label: '채용', color: 0x57f287 },
  news: { label: '소식', color: 0x99aab5 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function buildPayload(item) {
  const k = KIND[item.kind] ?? KIND.news;
  const fields = [];
  if (item.organizer) fields.push({ name: '주최', value: item.organizer.slice(0, 200), inline: true });
  if (item.deadline) fields.push({ name: '마감', value: item.deadline, inline: true });
  if (item.tags?.length) fields.push({ name: '분류', value: item.tags.join(', ').slice(0, 200), inline: true });
  const payload = {
    allowed_mentions: { parse: [] },
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
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) throw new Error('DISCORD_WEBHOOK_URL이 설정되지 않음');
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
    if (!res.ok) throw new Error(`디스코드 게시 실패 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await sleep(1200);
    return;
  }
  throw new Error('디스코드 게시 실패: 요청 제한이 풀리지 않음');
}
