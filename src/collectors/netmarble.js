import { getJson } from '../http.js';

// 넷마블 채용 사이트가 쓰는 공고 목록 주소(넷마블 계열사 공고가 함께 나온다).
const BASE = 'https://career.netmarble.com';
const dateOnly = (s) => (s && !s.startsWith('2999') ? s.slice(0, 10) : null); // 2999-12-31 = 상시

export async function collect(source) {
  const items = [];
  for (let page = 1; page <= (source.maxPages ?? 10); page++) {
    const data = await getJson(`${BASE}/api/v1/apply/announces?page=${page}&size=100`);
    const list = data.content ?? [];
    for (const a of list) {
      items.push({
        title: a.annoSubject,
        url: `${BASE}/announce/view?anno_id=${a.carAnnoId}`,
        organizer: a.companyNm ?? '넷마블',
        deadline: a.isUnlimitedEndDate ? null : dateOnly(a.endDate),
        // 직무군 이름("기술/AI")은 넣지 않는다. 보안·인프라 공고까지 AI 키워드에 걸린다.
        tags: [a.reqTypeNm, a.entTypeNm, a.genreNm].filter(Boolean),
        summary: [a.carWorkGroupNm, a.genreNm].filter(Boolean).join(' · '),
      });
    }
    const totalPages = data.page?.totalPages ?? data.totalPages;
    if (list.length === 0 || (totalPages && page >= totalPages)) break;
  }
  return items;
}
