// 整轮测试共用一个临时根：用例、它们起的子进程和 Stryker 都在这里建临时目录，跑完整个删掉。
// 用例各自的清理漏掉的（中途失败、子进程留下的），也不会落到系统临时目录里。
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default function setup() {
  const root = mkdtempSync(join(tmpdir(), "pqw-test-run-"));
  process.env.TMPDIR = root;
  process.env.PQW_TEST_TMP_ROOT = root;
  return () => rmSync(root, { recursive: true, force: true });
}
