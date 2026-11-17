import { getJson } from '../http.js';

// Greenhouse 공개 채용 보드 API. board는 boards.greenhouse.io/<board>의 그 이름이다.
export async function collect(source) {
  const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${source.board}/jobs`);
  return (data.jobs ?? []).map((j) => ({
    title: j.title,
    url: j.absolute_url,
    organizer: j.company_name ?? source.name,
    deadline: null,
    tags: ['채용'],
    summary: j.location?.name ?? '',
    location: j.location?.name ?? null,
  }));
}
