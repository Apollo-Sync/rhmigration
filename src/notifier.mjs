import fs from 'fs';
import { TOPICS, STOCK_QUOTES } from './config.mjs';
import { getLiq } from './liquidity.mjs';
import { getOnChainStats } from './onchainStats.mjs';
import { now, fmtPct, topicToAddr, xTickerSearch, xCaSearch } from './format.mjs';
import { sendTelegram } from './telegram.mjs';

const seenTx = new Set();
const seenToken = new Set();

// File lưu lại các CA đã tìm được, mỗi dòng 1 token.
// Dùng appendFileSync nên khi mở lại chương trình, dữ liệu cũ vẫn giữ nguyên,
// CA mới chỉ được nối thêm vào cuối file chứ không ghi đè.
const CA_FILE = 'ca-migrate.txt';

function saveTokenCA(token) {
  try {
    fs.appendFileSync(CA_FILE, token + '\n', 'utf8');
  } catch (e) {
    console.log(`[!] Không thể ghi vào ${CA_FILE}: ${e.message}`);
  }
}

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

// Ngưỡng % supply dev còn giữ để cảnh báo màu đỏ (tùy chỉnh nếu muốn khắt khe hơn/lỏng hơn)
const DEV_WARN_PCT = 5;

function classifyEvent(topic0) {
  const t0 = (topic0 || "").toLowerCase();
  if (t0 === TOPICS[0].toLowerCase()) return "PoolGraduated";
  if (t0 === TOPICS[1].toLowerCase()) return "LaunchSwept";
  return "MultiDexSignal";
}

function printAlert(kind, token, log, info, stats) {
  const liq = info?.liq || 0;
  const mc = info?.mc || 0;

  console.log(GREEN + "=".repeat(64));
  console.log(`[${now()}] 🚀 / ${kind}   $${info?.sym || "?"}  ${info?.name || ""}`);
  console.log(`  CA       ${token}`);
  console.log(`  Tx       ${log.transactionHash}`);
  console.log(`  Block    ${parseInt(log.blockNumber, 16)}`);
  console.log(
    info
      ? `  Liq      $${liq.toLocaleString("en-US")}  (${info.source})`
      : "  Liq      chưa index"
  );
  console.log(`  MC/FDV   $${mc.toLocaleString("en-US")}`);
  console.log(`  Holders  ${stats?.holders ?? "n/a"}`);
  console.log(`  Top10    ${fmtPct(stats?.top10)}`);
  console.log(`  Snipers  ${stats?.snipers ?? "n/a"}`);

  // % supply mà ví dev (deployer) còn đang cầm — dev giữ nhiều thì rủi ro rug cao hơn
  if (stats?.devAddr) {
    const devShort = `${stats.devAddr.slice(0, 6)}...${stats.devAddr.slice(-4)}`;
    const isRisky = stats.devPct != null && stats.devPct >= DEV_WARN_PCT;
    const line = `  Dev      ${fmtPct(stats.devPct)}  (${devShort})${isRisky ? "  ⚠️ dev còn giữ nhiều" : ""}`;
    console.log(isRisky ? RED + line + GREEN : line);
  } else {
    console.log(`  Dev      n/a (không xác định được ví deployer)`);
  }
  console.log(`  X        ${info?.twitter || "n/a"}`);
  console.log(`  Telegram ${info?.telegram || "n/a"}`);
  console.log(`  Web      ${info?.website || "n/a"}`);
  console.log(`  GMGN     https://gmgn.ai/robinhood/token/${token}`);

  // --- Story check: không tự chấm điểm, chỉ đưa link để tự tra trong ~10s ---
  const quote = info?.quoteSym;
  if (quote && STOCK_QUOTES.includes(quote.toUpperCase())) {
    console.log(`  Pair     ${info?.sym || "?"}/${quote}  ⚡ pair với cổ phiếu -> khả năng đang bám tin ${quote}`);
  } else if (quote) {
    console.log(`  Pair     ${info?.sym || "?"}/${quote}`);
  }

  const tSym = xTickerSearch(info?.sym);
  const tCa = xCaSearch(token);
  if (tSym) console.log(`  X ticker ${tSym}`);
  if (tCa) console.log(`  X CA     ${tCa}`);

  console.log("=".repeat(64) + RESET);
}

function buildTelegramMessage(kind, token, log, info, stats) {
  const liq = info?.liq || 0;
  const mc = info?.mc || 0;

  const lines = [];
  lines.push(`🚀 *${kind}*  $${info?.sym || "?"}  ${info?.name || ""}`);
  lines.push(`CA: \`${token}\``);
  lines.push(`Tx: \`${log.transactionHash}\``);
  lines.push(`Block: ${parseInt(log.blockNumber, 16)}`);
  lines.push(
    info
      ? `Liq: $${liq.toLocaleString("en-US")} (${info.source})`
      : `Liq: chưa index`
  );
  lines.push(`MC/FDV: $${mc.toLocaleString("en-US")}`);
  lines.push(`Holders: ${stats?.holders ?? "n/a"}`);
  lines.push(`Top10: ${fmtPct(stats?.top10)}`);
  lines.push(`Snipers: ${stats?.snipers ?? "n/a"}`);

  if (stats?.devAddr) {
    const devShort = `${stats.devAddr.slice(0, 6)}...${stats.devAddr.slice(-4)}`;
    const isRisky = stats.devPct != null && stats.devPct >= DEV_WARN_PCT;
    lines.push(`Dev: ${fmtPct(stats.devPct)} (${devShort})${isRisky ? " ⚠️ dev còn giữ nhiều" : ""}`);
  } else {
    lines.push(`Dev: n/a`);
  }

  lines.push(`X: ${info?.twitter || "n/a"}`);
  lines.push(`Telegram: ${info?.telegram || "n/a"}`);
  lines.push(`Web: ${info?.website || "n/a"}`);
  lines.push(`GMGN: https://gmgn.ai/robinhood/token/${token}`);

  const quote = info?.quoteSym;
  if (quote && STOCK_QUOTES.includes(quote.toUpperCase())) {
    lines.push(`Pair: ${info?.sym || "?"}/${quote}  ⚡ khả năng đang bám tin ${quote}`);
  } else if (quote) {
    lines.push(`Pair: ${info?.sym || "?"}/${quote}`);
  }

  const tSym = xTickerSearch(info?.sym);
  const tCa = xCaSearch(token);
  if (tSym) lines.push(`X ticker: ${tSym}`);
  if (tCa) lines.push(`X CA: ${tCa}`);

  return lines.join('\n');
}

export async function onGraduate(log) {
  const token = topicToAddr(log.topics?.[1]) || topicToAddr(log.topics?.[2]);
  if (!token) return;

  const key = `${log.transactionHash}:${log.logIndex}`;
  if (seenTx.has(key) || seenToken.has(token)) return;
  seenTx.add(key);
  seenToken.add(token);
  saveTokenCA(token);

  const kind = classifyEvent(log.topics?.[0]);

  const [info, stats] = await Promise.all([
    getLiq(token),
    getOnChainStats(token, log.blockNumber)
  ]);

  printAlert(kind, token, log, info, stats);

  const tgMessage = buildTelegramMessage(kind, token, log, info, stats);
  sendTelegram(tgMessage).catch(() => {});
}
