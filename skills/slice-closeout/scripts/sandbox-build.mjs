#!/usr/bin/env node
// mutation.mjs --build-command 时 Stryker 在沙箱里执行的 buildCommand：先把项目的 node_modules 链进沙箱，再经 shell 跑用户的构建命令。
// 不直接调用；逻辑与理由在 lib/stryker.mjs 的 sandboxBuild。
import { sandboxBuild } from "./lib/stryker.mjs";

process.exit(sandboxBuild());
