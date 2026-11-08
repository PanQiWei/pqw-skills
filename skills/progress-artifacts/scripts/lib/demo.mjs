// demo 追加的逻辑：从骨架起页、生成切片段、同号替换或在结尾标记前插入。纯函数，不读文件。
export const SECTIONS_END = "<!-- /pqw:sections -->";

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 命令面必填项齐了：demo、slice、title，加 file 或 text 之一。 */
export const requiredGiven = (o) => Boolean(o.demo && o.slice && o.title && (o.file || o.text));

/** 骨架替换页标题。 */
export const fromSkeleton = (skeleton, pageTitle) => skeleton.replace(/\{\{title\}\}/g, esc(pageTitle ?? "demo"));

/** 切片号补成两位。 */
export const sliceId = (slice) => String(slice).padStart(2, "0");

/** 一个切片的段落，带标记便于同号替换。 */
export function sliceSection({ id, title, body, when }) {
  return `<!-- pqw:slice ${id} -->\n<section class="slice" id="slice-${id}">\n<h2>切片 ${id}：${esc(title)}</h2>\n<div class="when">${when}</div>\n${body.trim()}\n</section>\n<!-- /pqw:slice ${id} -->`;
}

/** 同号已有就替换，否则插在结尾标记前；没有结尾标记返回 null。 */
export function appendSection(html, section, id) {
  const existing = new RegExp(`<!-- pqw:slice ${id} -->[\\s\\S]*?<!-- /pqw:slice ${id} -->`);
  if (existing.test(html)) return html.replace(existing, section);
  if (html.includes(SECTIONS_END)) return html.replace(SECTIONS_END, `${section}\n${SECTIONS_END}`);
  return null;
}
