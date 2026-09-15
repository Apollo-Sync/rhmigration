import { rpc } from './rpcClient.mjs';
import { FACTORIES, EXECUTOR, TOPICS, CHUNK_SIZE } from './config.mjs';
import { now } from './format.mjs';

export async function getLogs(from, to) {
  let allLogs = [];
  let currentStart = from;

  while (currentStart <= to) {
    let currentEnd = Math.min(currentStart + CHUNK_SIZE - 1, to);
    
    process.stdout.write(`\r[${now()}] 🔍 Đang quét block: ${currentStart} -> ${currentEnd} (Latest: ${to})   `);

    let success = false;
    let retries = 3;

    while (retries > 0 && !success) {
      try {
        const logs = await rpc("eth_getLogs", [
          {
            address: [...FACTORIES, EXECUTOR],
            fromBlock: "0x" + currentStart.toString(16),
            toBlock: "0x" + currentEnd.toString(16),
            topics: [TOPICS],
          },
        ]);
        if (Array.isArray(logs)) {
          allLogs.push(...logs);
          success = true;
        }
      } catch (e) {
        retries--;
        if (retries === 0) {
          process.stdout.write(`\n[-] Lỗi block ${currentStart}-${currentEnd}: ${e.message}\n`);
        } else {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    currentStart = currentEnd + 1;
  }
  return allLogs;
}