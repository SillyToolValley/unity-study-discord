import { getJson } from '../http.js';

// 카카오 채용 사이트의 공고 목록 주소(카카오와 계열사 공고가 함께 나온다).
export async function collect(source) {
  const items = [];
  for (let page = 1; page <= (source.maxPages ?? 10); page++) {
    const data = await getJson(`https://careers.kakao.com/public/api/job-list?company=ALL&page=${page}`);
    for (const j of data.jobList ?? []) {
      if (j.closeFlag || j.privateFlag) continue;
      items.push({
        title: j.jobOfferTitle,
        url: `https://careers.kakao.com/jobs/${j.realId}`,
        organizer: j.companyName || '카카오',
        deadline: j.endDate ? String(j.endDate).slice(0, 10) : null,
        tags: [j.jobTypeName, j.employeeTypeName].filter(Boolean),
        summary: j.locationName ?? '',
        location: j.locationName || null,
      });
    }
    if (page >= (data.totalPage ?? 1)) break;
  }
  return items;
}
