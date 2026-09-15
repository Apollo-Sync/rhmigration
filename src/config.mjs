import fs from 'fs';

// Đọc danh sách RPC từ file rpc.txt
function loadRpcList() {
  try {
    const data = fs.readFileSync('rpc.txt', 'utf8');
    const list = data
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    if (list.length > 0) return list;
  } catch (e) {
    console.log("[-] Không tìm thấy file rpc.txt hoặc file trống, dùng RPC mặc định.");
  }
  return ["https://rpc.mainnet.chain.robinhood.com"];
}

export const RPC_LIST = loadRpcList();

// Đọc cấu hình Telegram từ file telegram.txt, gồm 2 dòng:
//   BOT_TOKEN=xxxxxxxx:yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
//   CHAT_ID=-1001234567890
// Nếu không có file hoặc thiếu 1 trong 2 giá trị -> tự tắt tính năng Telegram,
// chương trình vẫn chạy bình thường (chỉ in ra console như cũ).
function loadTelegramConfig() {
  try {
    const data = fs.readFileSync('telegram.txt', 'utf8');
    const cfg = {};
    for (const line of data.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      cfg[key] = value;
    }
    return cfg;
  } catch (e) {
    return {};
  }
}

const telegramCfg = loadTelegramConfig();
export const TELEGRAM_BOT_TOKEN = telegramCfg.BOT_TOKEN || "";
export const TELEGRAM_CHAT_ID = telegramCfg.CHAT_ID || "";
export const TELEGRAM_ENABLED = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);

if (!TELEGRAM_ENABLED) {
  console.log("[-] Không tìm thấy telegram.txt (hoặc thiếu BOT_TOKEN/CHAT_ID) -> tắt gửi Telegram.");
}

export const POLL_SEC = 6;
export const LOOKBACK_BLOCKS = 400;   // Dải quét lịch sử rộng khi khởi động
export const CHUNK_SIZE = 5;          // Chia nhỏ dải block để tương thích với giới hạn của RPC Free

export const FACTORIES = [
  "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e",
];

export const EXECUTOR = "0xc7819b64a1daecd7ec19856d026cb14efbd89046";

export const TOPICS = [
  "0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259", // Graduated / Pons V2
  "0xcdb72f157fd3666758a6ce201387ffb52038c7562e4fff352828da1096c4b6b4", // Swept / Migrate
  "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d06d"
];

export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Blockscout API của Robinhood Chain — dùng để tra ví deployer (dev) của token,
// vì phương thức này chuẩn xác hơn nhiều so với việc đoán qua log Transfer.
export const BLOCKSCOUT_API = "https://robinhoodchain.blockscout.com/api/v2";

// Các quote token là cổ phiếu tokenized trên RH chain — nếu token pair với
// một trong số này, khả năng cao nó đang bám câu chuyện của cổ phiếu đó.
export const STOCK_QUOTES = [
  "NVDA", "AAPL", "HOOD", "SPY", "TSLA", "MSTR",
  "GOOGL", "AMZN", "META", "NFLX", "COIN", "QQQ",
];
