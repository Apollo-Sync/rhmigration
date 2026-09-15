export const now = () =>
  new Date().toLocaleTimeString("vi-VN", { hour12: false });

export const fmtPct = (x) => (x == null ? "n/a" : `${x.toFixed(2)}%`);

export function topicToAddr(topic) {
  if (!topic || topic.length < 66) return "";
  return ("0x" + topic.slice(26)).toLowerCase();
}

// Link search X theo ticker ($TICKER)
export function xTickerSearch(sym) {
  if (!sym) return null;
  const q = encodeURIComponent(`$${sym}`);
  return `https://x.com/search?q=${q}&f=live`;
}

// Link search X theo địa chỉ contract (để bắt tweet nhắc thẳng CA)
export function xCaSearch(token) {
  if (!token) return null;
  return `https://x.com/search?q=${token}&f=live`;
}
