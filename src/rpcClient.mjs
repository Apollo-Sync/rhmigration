import { RPC_LIST } from './config.mjs';

let currentRpcIndex = 0;

export function getActiveRpc() {
  return RPC_LIST[currentRpcIndex];
}

export function rotateRpc() {
  currentRpcIndex = (currentRpcIndex + 1) % RPC_LIST.length;
  console.log(`[!] Chuyển sang RPC dự phòng: ${getActiveRpc()}`);
}

// Hàm kiểm tra xem RPC có hoạt động hay không bằng cách gọi thử eth_blockNumber với timeout 5 giây
export async function checkRpc(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const json = await res.json();
    if (json.result) return true;
  } catch (e) {
    // RPC lỗi hoặc quá hạn timeout
  }
  return false;
}

// Kiểm tra toàn bộ danh sách RPC và chọn ra RPC sống đầu tiên trước khi chạy chương trình
export async function initRpc() {
  console.log("[*] Đang kiểm tra trạng thái các RPC...");
  for (let i = 0; i < RPC_LIST.length; i++) {
    const url = getActiveRpc();
    process.stdout.write(`    - Kiểm tra ${url} ... `);
    const isAlive = await checkRpc(url);
    if (isAlive) {
      console.log("\x1b[32mOK\x1b[0m");
      return true;
    } else {
      console.log("\x1b[31mĐơ/Lỗi\x1b[0m");
      rotateRpc();
    }
  }
  console.log("[-] Tất cả RPC trong danh sách đều không phản hồi!");
  return false;
}

export async function rpc(method, params = []) {
  let tries = 0;
  const maxTries = RPC_LIST.length;

  while (tries < maxTries) {
    const currentUrl = getActiveRpc();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(currentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const json = await res.json();
      if (json.error) {
        throw new Error(json.error.message || "rpc error");
      }
      return json.result;
    } catch (e) {
      tries++;
      rotateRpc();
      if (tries >= maxTries) {
        throw new Error(`Tất cả RPC trong rpc.txt đều lỗi: ${e.message}`);
      }
    }
  }
}

export async function latestBlock() {
  return parseInt(await rpc("eth_blockNumber"), 16);
}