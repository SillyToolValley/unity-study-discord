import { getJson } from '../http.js';

// 토스 채용 사이트의 공고 목록 주소(토스와 계열사 공고가 함께 나온다).
export async function collect() {
  const data = await getJson('https://api-public.toss.im/api/v3/ipd-eggnog/career/jobs');
  return (data.success ?? []).map((j) => {
    const meta = Object.fromEntries((j.metadata ?? []).map((m) => [m.name, m.value]));
    return {
      title: j.title,
      url: j.absolute_url,
      organizer: meta['포지션의 소속 자회사를 선택해 주세요.'] || '토스',
      deadline: null,
      tags: ['채용', meta.Employment_Type].filter((v) => typeof v === 'string' && v),
      summary: j.location?.name ?? '',
      location: j.location?.name ?? null,
    };
  });
}
