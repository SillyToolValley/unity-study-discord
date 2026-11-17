import { postJson } from '../http.js';

// LG 그룹 채용 사이트가 쓰는 공고 목록 주소(LG 계열사 공고가 함께 나온다). 조회 조건을 비워서 전체를 받는다.
const ymd = (s) => {
  const m = (s ?? '').match(/(20\d{2})\.(\d{2})\.(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

export async function collect() {
  const res = await postJson('https://api.careers.lg.com/rmk/search/retrieveJobNoticesList', {
    lnbSearch: '', hashTagText: '', recDate: 'POST_START_DATE', order: 'DESC',
    careerList: [], companyCodeList: [], desireLocList: [], jobGroupList: [],
  });
  if (res.status !== 'S') throw new Error('LG 목록 조회 실패: ' + JSON.stringify(res).slice(0, 120));
  return (res.data?.jobNoticeList ?? []).map((j) => ({
    title: j.jobNoticeName,
    url: `https://careers.lg.com/apply/detail?id=${j.jobNoticeId}`,
    organizer: j.companyName ?? 'LG',
    deadline: ymd(j.recEndDateTime),
    tags: [j.careerTypeName, j.recruitTypeName, j.jobGroupName].filter(Boolean),
    summary: [j.workLocationName, j.hashtagText].filter(Boolean).join(' · ').slice(0, 200),
    location: j.workLocationName || null,
  }));
}
