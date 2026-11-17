import { getText } from '../http.js';

// HD현대 그룹 채용 사이트가 쓰는 공고 목록 주소. 지난 공고도 함께 내려와서 진행 중인 것만 고른다.
const dateOnly = (s) => (s && Number(s.slice(0, 4)) < 2090 ? s.slice(0, 10) : null); // 2099·2100년 = 상시

export async function collect() {
  const data = JSON.parse(await getText('https://recruit.hd.com/api/v1/jobda/getRecruitNoticeList?isPost=true&LANG=KR'));
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  return (data.data ?? [])
    .filter((n) => n.isPost && n.isInProgress !== false && (n.receiveEndDatetime ?? '9999') >= today)
    .map((n) => ({
      title: n.recruitNoticeName,
      url: n.recruitNoticeUrl || 'https://recruit.hd.com/kr',
      organizer: n.companyCategory ?? 'HD현대',
      deadline: dateOnly(n.receiveEndDatetime),
      tags: [n.recruitClassName, n.recruitTypeName].filter(Boolean),
      summary: n.receiveStartDatetime ? `접수 시작 ${n.receiveStartDatetime.slice(0, 10)}` : '',
    }));
}
