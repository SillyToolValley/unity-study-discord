import { getText } from '../http.js';

const decode = (s) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();

// 게임잡 채용 목록. 링크의 onclick 인자에 제목, 회사, 직무, 분야가 들어 있다.
export function parseList(html) {
  const items = [];
  const re = /href="(\/Recruit\/GI_Read\/View\?GI_No=(\d+))"\s+onclick="GA_Application_Prdt\(([^"]*?)\);"/g;
  for (const m of html.matchAll(re)) {
    const args = [...m[3].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => decode(x[1]));
    // args: [이벤트명, 구분, 제목, 번호, 회사, ?, 직무, 게임분야, ?, 지역]
    if (args.length < 5) continue;
    items.push({
      title: args[2],
      url: 'https://www.gamejob.co.kr' + m[1],
      organizer: args[4],
      deadline: null,
      tags: [args[6], args[7]].filter((t) => t && t !== '없음'),
      summary: args[9] && args[9] !== '없음' ? args[9] : '',
      location: args[9] && args[9] !== '없음' ? args[9] : null,
    });
  }
  return items;
}

export async function collect(source) {
  return parseList(await getText(source.url ?? 'https://www.gamejob.co.kr/Recruit/joblist?menucode=duty'));
}
