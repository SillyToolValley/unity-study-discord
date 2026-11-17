import { getJson } from '../http.js';

// Ashby 공개 채용 API. board는 jobs.ashbyhq.com/<board>의 그 이름이다.
export async function collect(source) {
  const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${source.board}`);
  return (data.jobs ?? []).filter((j) => j.isListed !== false).map((j) => ({
    title: j.title,
    url: j.jobUrl,
    organizer: source.company ?? source.name,
    deadline: null,
    tags: ['채용', j.employmentType, j.department].filter(Boolean),
    summary: j.location ?? '',
    location: [j.location, j.address?.postalAddress?.addressCountry, ...(j.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean).join(' | ') || null,
    remote: Boolean(j.isRemote) || /remote/i.test(j.workplaceType ?? ''),
  }));
}
