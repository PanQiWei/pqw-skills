// 本仓库自己的测试：node:assert 断言，vitest 跑；命令面用例真起子进程，所以时限放宽。覆盖率只算技能脚本与仓库脚本。
// 整轮测试的临时目录都建在 global-setup 给的临时根下，跑完整个删掉，系统临时目录里不留东西。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
    globalSetup: ["tests/global-setup.mjs"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    coverage: { provider: "v8", reporter: ["lcov"], reportsDirectory: "coverage", include: ["skills/**/scripts/**/*.mjs", "scripts/**/*.mjs"], all: false },
  },
});
