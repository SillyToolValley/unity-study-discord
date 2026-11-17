import { getJson } from '../http.js';

// NHN 채용 사이트가 쓰는 공고 목록 주소(NHN 계열사 공고가 함께 나온다).
const BASE = 'https://careers.nhn.com';

export async function collect(source) {
  const items = [];
  for (let page = 0; page < (source.maxPages ?? 10); page++) {
    const data = await getJson(`${BASE}/v1/job-postings?intensive-recruiting=&page=${page}&size=30`);
    const list = data.result ?? [];
    for (const j of list) {
      if (j.finishYn === 'Y' || j.postingYn === 'N') continue;
      items.push({
        title: j.name,
        url: `${BASE}/recruits/${j.id}`,
        organizer: j.corporation?.name ?? 'NHN',
        // 2999-12-31 = 상시 채용
        deadline: j.postingEndDatetime && Number(j.postingEndDatetime.slice(0, 4)) < 2090 ? j.postingEndDatetime.slice(0, 10) : null,
        tags: [j.careerType?.name === '무관' ? '경력무관' : j.careerType?.name, j.employeeType?.name].filter(Boolean),
        summary: (j.jobSeries ?? []).map?.((s) => s.name).filter(Boolean).join(' · ') ?? '',
        location: j.corporation?.regionCd || null, // KR, JP 등
      });
    }
    if (list.length < 30) break;
  }
  return items;
}
