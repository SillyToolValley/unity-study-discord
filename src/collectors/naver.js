import { getText } from '../http.js';

// 네이버 계열 채용 사이트(네이버, 네이버클라우드, 네이버랩스)가 함께 쓰는 공고 목록 주소.
// source.origin = 예: https://recruit.navercorp.com
const ymd = (s) => (/^\d{8}$/.test(s ?? '') ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : null);

export async function collect(source) {
  const items = [];
  for (let first = 0; first < (source.maxItems ?? 100); first += 10) {
    const data = JSON.parse(await getText(`${source.origin}/rcrt/loadJobList.do?firstIndex=${first}`));
    const list = data.list ?? [];
    for (const j of list) {
      items.push({
        title: j.annoSubject,
        url: `${source.origin}/rcrt/view.do?annoId=${j.annoId}`,
        organizer: j.sysCompanyCdNm ?? source.name,
        deadline: ymd(j.endYmd),
        tags: [j.entTypeCdNm, j.empTypeCdNm, j.classCdNm, j.subJobCdNm].filter(Boolean),
        summary: j.endYmdTime ? `마감 ${j.endYmdTime}` : '',
      });
    }
    if (list.length < 10) break;
  }
  return items;
}
