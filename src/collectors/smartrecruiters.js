import { getJson } from '../http.js';

// SmartRecruiters 공개 채용 API. board는 회사 식별자다.
export async function collect(source) {
  const data = await getJson(`https://api.smartrecruiters.com/v1/companies/${source.board}/postings?limit=100`);
  return (data.content ?? []).map((j) => ({
    title: j.name,
    url: `https://jobs.smartrecruiters.com/${source.board}/${j.id}`,
    organizer: source.company ?? source.name,
    deadline: null,
    tags: ['채용', j.typeOfEmployment?.label, j.experienceLevel?.label].filter(Boolean),
    summary: [j.location?.city, j.location?.country?.toUpperCase()].filter(Boolean).join(', '),
    location: [j.location?.city, j.location?.country?.toUpperCase()].filter(Boolean).join(', ') || null,
    remote: Boolean(j.location?.remote),
  }));
}
