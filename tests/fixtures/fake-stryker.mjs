// 假的 Stryker 二进制：被当作 `node <coreBin> run <配置路径>` 调用，不跑测试，只把事先准备好的报告依次写出来。
// PQW_FAKE_REPORTS：逗号分隔的报告路径，第 n 次调用写第 n 份；PQW_FAKE_STATE：记调用次数的文件。
// 收到的配置抄到 `<配置路径>.seen`，用例据此核并行度、超时与 mutate 条目。没有报告可写时退出 1 且不写报告（模拟一轮失败）。
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";

const configPath = process.argv[3];
const config = JSON.parse(readFileSync(configPath, "utf8"));
writeFileSync(`${configPath}.seen`, JSON.stringify(config, null, 2) + "\n");
const statePath = process.env.PQW_FAKE_STATE;
const n = statePath && existsSync(statePath) ? Number(readFileSync(statePath, "utf8")) : 0;
if (statePath) writeFileSync(statePath, String(n + 1));
const reports = (process.env.PQW_FAKE_REPORTS ?? "").split(",").filter(Boolean);
console.log("Initial test run succeeded. Ran 2 tests in 1 second (net 10 ms, overhead 5 ms).");
if (!reports[n]) { console.error(`假 Stryker：第 ${n + 1} 轮没有准备报告`); process.exit(1); }
copyFileSync(reports[n], config.jsonReporter.fileName);
console.log(`Mutation testing 100% (elapsed: ~0s, remaining: n/a) ${n + 1}`);
