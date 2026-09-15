import { latestBlock, initRpc } from './src/rpcClient.mjs';
import { getLogs } from './src/logs.mjs';
import { onGraduate } from './src/notifier.mjs';
import { initTelegram } from './src/telegram.mjs';
import { LOOKBACK_BLOCKS, POLL_SEC } from './src/config.mjs';

let fromBlock = null;

export async function tick() {
  try {
    const latest = await latestBlock();
    if (fromBlock == null) {
      fromBlock = Math.max(0, latest - LOOKBACK_BLOCKS);
    }
    
    if (latest - fromBlock > 2000) {
      fromBlock = latest - 2000;
    }

    const toBlock = latest;
    if (fromBlock <= toBlock) {
      const logs = await getLogs(fromBlock, toBlock);

      if (logs.length > 0) {
        process.stdout.write(`\n`);
      }

      for (const log of logs) {
        onGraduate(log).catch(e => {});
      }
      
      fromBlock = toBlock + 1;
    }
  } catch (e) {
    process.stdout.write(`\n[!] Lỗi trong vòng lặp tick: ${e.message}\n`);
  }

  setTimeout(tick, (POLL_SEC || 6) * 1000);
}

async function main() {
  const ok = await initRpc();
  if (!ok) {
    console.log("[-] Không tìm thấy RPC nào khả dụng. Vui lòng kiểm tra lại file rpc.txt!");
    process.exit(1);
  }

  await initTelegram();

  console.log("[+] Khởi động Radar thành công. Đang quét dữ liệu...\n");
  tick();
}

main();
