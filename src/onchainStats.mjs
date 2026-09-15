import { rpc, latestBlock } from './rpcClient.mjs';
import { TRANSFER_TOPIC, CHUNK_SIZE, BLOCKSCOUT_API } from './config.mjs';

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// Chia nhỏ dải block theo CHUNK_SIZE (giống getLogs) để không vượt giới hạn của RPC free plan
async function fetchTransferLogs(token, startBlock, endBlock) {
  let allLogs = [];
  let currentStart = startBlock;

  while (currentStart <= endBlock) {
    const currentEnd = Math.min(currentStart + CHUNK_SIZE - 1, endBlock);
    try {
      const logs = await rpc("eth_getLogs", [{
        address: token,
        topics: [TRANSFER_TOPIC],
        fromBlock: "0x" + currentStart.toString(16),
        toBlock: "0x" + currentEnd.toString(16)
      }]);
      if (Array.isArray(logs)) {
        allLogs.push(...logs);
      }
    } catch (e) {
      console.log(`[DEBUG] Lỗi lấy logs transfer của token ${token} (block ${currentStart}-${currentEnd}):`, e.message);
    }
    currentStart = currentEnd + 1;
  }
  return allLogs;
}

function collectHoldersAndSnipers(logs, targetBlockNum) {
  const addresses = new Set();
  const txSendersInFirstBlock = new Set();

  for (const l of logs) {
    if (l.topics && l.topics[1] && l.topics[2]) {
      const fromAddr = "0x" + l.topics[1].slice(26).toLowerCase();
      const toAddr = "0x" + l.topics[2].slice(26).toLowerCase();

      addresses.add(fromAddr);
      addresses.add(toAddr);

      if (targetBlockNum > 0 && parseInt(l.blockNumber, 16) === targetBlockNum) {
        if (fromAddr === ZERO_ADDR) {
          txSendersInFirstBlock.add(toAddr);
        }
      }
    }
  }
  addresses.delete(ZERO_ADDR);
  return { addresses, txSendersInFirstBlock };
}

// Blockscout (đứng sau Cloudflare) hay trả 403 cho request không có
// User-Agent giống trình duyệt thật (Node fetch mặc định gửi UA kiểu
// "node"/"undici" rất dễ bị WAF chặn). Header dưới đây giả lập trình duyệt,
// đồng thời thử lại nếu bị 403/429/5xx (có thể do rate-limit/chặn tạm thời).
const BROWSER_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://robinhoodchain.blockscout.com/",
};

async function fetchBlockscout(path, label, token) {
  let lastStatus = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BLOCKSCOUT_API}${path}`, { headers: BROWSER_HEADERS });
      if (res.ok) return await res.json();
      lastStatus = res.status;
      // 403/429 -> có thể do chặn/rate-limit tạm thời, chờ rồi thử lại
      if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise(r => setTimeout(r, 500 * attempt));
        continue;
      }
      break;
    } catch (e) {
      console.log(`[DEBUG] Lỗi gọi Blockscout ${label} cho ${token}: ${e.message}`);
      return null;
    }
  }
  console.log(`[DEBUG] Blockscout ${label} trả về lỗi ${lastStatus} cho ${token} (đã thử lại)`);
  return null;
}

// Tra địa chỉ ví dev (người đã tạo token) qua Blockscout API.
//
// Lưu ý: token ở đây được tạo qua factory/bonding curve (xem FACTORIES trong
// config.mjs), nên "creator_address_hash" mà Blockscout trả về cho address
// của TOKEN có thể chỉ là factory contract (người trực tiếp gọi CREATE2),
// chứ không phải ví người dùng đã bấm tạo token — khác với cách GMGN hiển thị
// "Dev". Để ra đúng ví dev thật (ví có thể DevBuy/DevSell), ta cần tra thêm
// transaction đã tạo ra token đó (creation_tx_hash) và lấy field "from" —
// đó mới là ví EOA đã gọi vào factory.
async function getDevAddress(token) {
  const data = await fetchBlockscout(`/addresses/${token}`, "/addresses", token);
  if (!data) return null;

  // Ưu tiên: tra ngược "from" của tx đã tạo token -> đây mới là ví dev thật
  // (giống cách GMGN xác định), chứ không phải creator trực tiếp của bytecode.
  const creationTxHash = data?.creation_tx_hash || data?.creation_transaction_hash;
  if (creationTxHash) {
    const txData = await fetchBlockscout(`/transactions/${creationTxHash}`, "/transactions", token);
    const sender = txData?.from?.hash;
    if (sender) return sender.toLowerCase();
    if (txData) console.log(`[DEBUG] Tx tạo token ${token} (${creationTxHash}) không có field "from"`);
  }

  // Fallback: dùng creator_address_hash nếu không tra được tx tạo token
  // (có thể là factory chứ không hẳn là dev thật, nhưng còn hơn n/a).
  const dev = data?.creator_address_hash;
  if (!dev) {
    console.log(`[DEBUG] Blockscout không trả về creator_address_hash lẫn creation_tx_hash cho ${token}`);
  }
  return dev ? dev.toLowerCase() : null;
}

// Gọi balanceOf(dev) trực tiếp trên contract token để lấy số dư hiện tại
async function fetchDevBalance(token, devAddr) {
  try {
    const paddedAddr = devAddr.replace("0x", "").padStart(64, "0");
    const data = "0x70a08231" + paddedAddr; // balanceOf(address)
    const balHex = await rpc("eth_call", [{ to: token, data }, "latest"]);
    return BigInt(balHex || "0x0");
  } catch {
    return 0n;
  }
}

async function fetchBalances(token, addrArray) {
  const balances = [];
  for (const addr of addrArray) {
    try {
      const paddedAddr = addr.replace("0x", "").padStart(64, "0");
      const data = "0x70a08231" + paddedAddr; // balanceOf(address)
      const balHex = await rpc("eth_call", [{ to: token, data }, "latest"]);
      const bal = BigInt(balHex || "0x0");
      if (bal > 0n) {
        balances.push({ addr, bal });
      }
    } catch {}
  }
  return balances;
}

// Đã tối ưu hóa dải block và bật log lỗi chi tiết để tránh lỗi n/a
export async function getOnChainStats(token, creationBlockHex) {
  try {
    const currentBlock = await latestBlock();

    // 1. Lấy tổng cung token (totalSupply)
    const totalSupplyRes = await rpc("eth_call", [{
      to: token,
      data: "0x18160ddd" // totalSupply()
    }, "latest"]);
    const totalSupply = BigInt(totalSupplyRes || "0x0");

    // Thu hẹp dải block quét trong 150 block gần nhất để không bị RPC node từ chối
    const startBlock = Math.max(0, currentBlock - 150);

    // 2. Tra ví dev (deployer) song song với việc quét log Transfer để đỡ tốn thời gian
    const [logs, devAddr] = await Promise.all([
      fetchTransferLogs(token, startBlock, currentBlock),
      getDevAddress(token)
    ]);

    let devPct = null;
    if (devAddr && totalSupply > 0n) {
      const devBal = await fetchDevBalance(token, devAddr);
      devPct = Number((devBal * 10000n) / totalSupply) / 100;
    }

    const targetBlockNum = creationBlockHex ? parseInt(creationBlockHex, 16) : 0;
    const { addresses, txSendersInFirstBlock } = collectHoldersAndSnipers(logs, targetBlockNum);

    // Lấy tối đa 30 địa chỉ để gọi balanceOf tránh quá tải RPC request
    const addrArray = Array.from(addresses).slice(0, 30);
    const balances = await fetchBalances(token, addrArray);

    balances.sort((a, b) => (b.bal > a.bal ? 1 : -1));
    const holderCount = addresses.size > 0 ? addresses.size : balances.length;

    let top10Sum = 0n;
    for (let i = 0; i < Math.min(10, balances.length); i++) {
      top10Sum += balances[i].bal;
    }

    let top10Rate = null;
    if (totalSupply > 0n && top10Sum > 0n) {
      top10Rate = Number((top10Sum * 10000n) / totalSupply) / 100;
    }

    const sniperCount = txSendersInFirstBlock.size > 0
      ? `${txSendersInFirstBlock.size} / ${holderCount}`
      : `0 / ${holderCount}`;

    return {
      holders: holderCount > 0 ? holderCount : null,
      top10: top10Rate,
      snipers: sniperCount,
      devPct,
      devAddr
    };
  } catch (e) {
    console.log(`[DEBUG] Tổng quan lỗi getOnChainStats cho ${token}:`, e.message);
    return null;
  }
}
