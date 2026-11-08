// 汇报件与 demo 两个命令面共用的参数解析：每个 --名 带一个值；--help 与 -h 返回 help。
/** 返回 { opts } 或 { help: true } 或 { error: "参数错误 x" }。 */
export function parseOptions(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (!a.startsWith("--") || i + 1 >= argv.length) return { error: `参数错误 ${a}` };
    opts[a.slice(2)] = argv[++i];
  }
  return { opts };
}
