// 날짜 공통 처리. 마감일은 모두 한국 날짜(YYYY-MM-DD)로 다룬다.
const KST = 9 * 3_600_000;
const DAY = 86_400_000;

// 한국 시간 기준 오늘(또는 오늘에서 n일 뒤) 날짜
export const kstDate = (now = Date.now(), plusDays = 0) => new Date(now + KST + plusDays * DAY).toISOString().slice(0, 10);

// "2026-11-18"에서 n일 더한 날짜
export const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

// 실제로 있는 날짜인지(2026-13-01, 2026-02-30 같은 값을 걸러낸다)
export function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z');
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// 글에서 마감일을 뽑는다. 못 찾거나 날짜가 이상하면 null.
//   "2026.11.16 ~ 2026.12.07"  → 뒤쪽 날짜
//   "마감 2026년 11월 17일", "2026.11.17까지" → 그 날짜(날짜가 하나면 마감 표시가 있을 때만)
//   "(~11/28)"                  → 올해 또는 내년 11월 28일
//   "D-6", "D-day"              → 오늘부터 센 날짜
export function parseDeadline(text, now = Date.now()) {
  const t = String(text ?? '');
  const dates = [...t.matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g)];
  const pick = (m) => {
    const s = ymd(m[1], m[2], m[3]);
    return validDate(s) ? s : null;
  };
  if (dates.length >= 2 || (dates.length === 1 && /~\s*20\d{2}/.test(t))) return pick(dates[dates.length - 1]);
  // "2026.11.01 ~" 처럼 시작일만 있는 경우는 마감일로 보지 않는다.
  if (dates.length === 1 && !t.includes('~') && /(마감|까지|deadline|due)/i.test(t)) return pick(dates[0]);
  // 연도 없이 "~11/28", "~ 11.28" 처럼 끝나는 날짜만 적힌 경우
  const md = t.match(/~\s*(\d{1,2})\s*[./]\s*(\d{1,2})(?!\s*[./]?\s*\d)/);
  if (md) {
    const today = kstDate(now);
    const y = Number(today.slice(0, 4));
    let s = ymd(y, md[1], md[2]);
    // 두 달 넘게 지난 날짜면 내년 마감으로 본다(연말에 다음 해 1~2월 마감을 적은 경우).
    if (validDate(s) && s < kstDate(now, -60)) s = ymd(y + 1, md[1], md[2]);
    if (validDate(s)) return s;
  }
  const dn = t.match(/D\s*-\s*(\d+)(?!\d)/i);
  if (dn) return kstDate(now, Number(dn[1]));
  if (/D\s*-\s*DAY/i.test(t)) return kstDate(now);
  return null;
}
