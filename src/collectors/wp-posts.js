import { getJson } from '../http.js';

// 워드프레스 사이트의 공개 글 목록(REST API). source.origin = 사이트 주소.
// 제목이 "회사｜공고명" 형식이면 회사를 주최로 뽑는다.
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').trim();

export async function collect(source) {
  const cutoff = Date.now() - (source.maxAgeDays ?? 14) * 86_400_000;
  const items = [];
  for (let page = 1; page <= (source.pages ?? 1); page++) {
    const posts = await getJson(
      `${source.origin}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,date,link,title`,
    );
    for (const p of posts) {
      if (Date.parse(p.date) < cutoff) continue;
      const title = decode(p.title?.rendered ?? '');
      const [company, ...rest] = title.split('｜');
      items.push({
        title,
        url: p.link,
        organizer: rest.length ? company.trim() : source.name,
        deadline: null,
        tags: [],
        summary: '',
      });
    }
    if (posts.length < 100) break;
  }
  return items;
}
