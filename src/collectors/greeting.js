import { getText } from '../http.js';

// Greeting(그리팅) 채용 사이트. 페이지에 내장된 공고 목록을 읽는다.
// source.url = 공고 목록이 보이는 채용 페이지 주소.
export function parseOpenings(html, pageUrl) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Greeting 페이지 구조가 바뀜: 내장 데이터를 찾지 못함');
  const queries = JSON.parse(m[1]).props?.pageProps?.dehydratedState?.queries ?? [];
  const q = queries.find((x) => Array.isArray(x.queryKey) && x.queryKey[0] === 'openings');
  if (!q || !Array.isArray(q.state?.data)) throw new Error('Greeting 공고 목록을 찾지 못함');
  const origin = new URL(pageUrl).origin;
  return q.state.data.filter((o) => o.deploy !== false).map((o) => {
    const pos = o.openingJobPosition?.openingJobPositions ?? [];
    const tags = new Set();
    // 요구 경력의 최소 연수. 신입·무관 포지션이 하나라도 있으면 0.
    const mins = pos.map((p) => {
      const c = p.jobPositionCareer;
      if (!c?.careerType) return null;
      return c.careerType === 'EXPERIENCED' ? (c.careerFrom ?? null) : 0;
    }).filter((v) => v !== null);
    for (const p of pos) {
      if (p.workspaceOccupation?.occupation) tags.add(p.workspaceOccupation.occupation);
      if (p.workspaceJob?.job) tags.add(p.workspaceJob.job);
      const career = p.jobPositionCareer?.careerType;
      if (career && career !== 'EXPERIENCED') tags.add(/NEW/.test(career) ? '신입' : '경력무관');
      if (/INTERN/.test(p.jobPositionEmployment?.employmentType ?? '')) tags.add('인턴');
    }
    return {
      title: o.title,
      url: `${origin}/ko/o/${o.openingId}`,
      deadline: o.dueDate ? String(o.dueDate).slice(0, 10) : null,
      minYears: mins.length ? Math.min(...mins) : undefined,
      tags: [...tags],
      summary: pos[0]?.workspacePlace?.location ?? '',
      // place = "대한민국 경기도 성남시 …" 같은 전체 주소
      location: pos.map((p) => p.workspacePlace?.place).filter(Boolean).join(' | ') || null,
      remote: pos.some((p) => p.workspacePlace?.workFromHome),
    };
  });
}

export async function collect(source) {
  return parseOpenings(await getText(source.url), source.url).map((i) => ({ ...i, organizer: source.company ?? source.name }));
}
