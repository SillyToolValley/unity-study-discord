import { getJson } from '../http.js';

// Lever 공개 채용 API. board는 jobs.lever.co/<board>의 그 이름이다.
export async function collect(source) {
  const data = await getJson(`https://api.lever.co/v0/postings/${source.board}?mode=json`);
  return (Array.isArray(data) ? data : []).map((j) => ({
    title: j.text,
    url: j.hostedUrl,
    organizer: source.company ?? source.name,
    deadline: null,
    tags: ['채용', j.categories?.commitment, j.categories?.team].filter(Boolean),
    summary: j.categories?.location ?? '',
    // categories.location에 회사명이 들어 있는 경우가 있어서 국가 코드(country)를 함께 둔다.
    location: [j.categories?.location, ...(j.categories?.allLocations ?? []), j.country].filter(Boolean).join(' | ') || null,
    remote: j.workplaceType === 'remote',
  }));
}
