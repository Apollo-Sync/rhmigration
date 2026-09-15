import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_ENABLED } from './config.mjs';

// Kiểm tra kết nối Telegram khi khởi động: gọi API getMe để xác nhận
// BOT_TOKEN hợp lệ thật sự (chứ không chỉ kiểm tra có file cấu hình hay không).
// Trả về true/false để radar.mjs quyết định có in "đã kết nối" hay không.
export async function initTelegram() {
  if (!TELEGRAM_ENABLED) {
    console.log("[-] Telegram: CHƯA kết nối (thiếu telegram.txt hoặc thiếu BOT_TOKEN/CHAT_ID).");
    return false;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;

  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => null);

    if (res.ok && data?.ok) {
      console.log(`[+] Telegram: Đã kết nối (bot @${data.result.username}) -> chat_id ${TELEGRAM_CHAT_ID}`);
      return true;
    }

    console.log(`[-] Telegram: CHƯA kết nối, BOT_TOKEN không hợp lệ (${res.status}).`);
    return false;
  } catch (e) {
    console.log(`[-] Telegram: CHƯA kết nối, lỗi mạng khi kiểm tra: ${e.message}`);
    return false;
  }
}

// Gửi 1 tin nhắn Telegram (Markdown). Không throw ra ngoài — lỗi Telegram
// không được phép làm chết chương trình radar chính.
export async function sendTelegram(text) {
  if (!TELEGRAM_ENABLED) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.log(`[!] Telegram lỗi (${res.status}): ${body}`);
    }
  } catch (e) {
    console.log(`[!] Không gửi được Telegram: ${e.message}`);
  }
}
