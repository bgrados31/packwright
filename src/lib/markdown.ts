const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

const INLINE_TAGS = new Set([
  "a", "b", "strong", "i", "em", "u", "s", "del", "span", "code", "sub",
  "sup", "small", "img", "br",
]);
const DROP_WITH_CONTENT =
  "script|style|iframe|object|embed|form|input|button|select|textarea|svg|math|template|video|audio|link|meta";

function safeUrl(value: unknown): string {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith("//")) return escapeHtml(`https:${url}`);
  if (/^https?:\/\//i.test(url)) return escapeHtml(url);
  return "";
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function sanitizeTag(raw: string): string {
  const match = raw.match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/);
  if (!match) return "";
  const closing = match[1] === "/";
  const name = match[2].toLowerCase();
  if (!INLINE_TAGS.has(name)) return "";
  if (name === "br") return "<br>";
  if (name === "img") {
    if (closing) return "";
    const attrs = parseAttrs(match[3]);
    const src = safeUrl(attrs.src);
    if (!src) return "";
    const alt = escapeHtml(attrs.alt || "");
    const width = /^\d{1,4}$/.test(attrs.width || "") ? ` width="${attrs.width}"` : "";
    return `<img src="${src}" alt="${alt}"${width} loading="lazy" referrerpolicy="no-referrer">`;
  }
  if (closing) return `</${name}>`;
  if (name === "a") {
    const href = safeUrl(parseAttrs(match[3]).href);
    return href
      ? `<a href="${href}" target="_blank" rel="noopener noreferrer">`
      : "<a>";
  }
  return `<${name}>`;
}

function inline(value: string): string {
  let text = value;
  const codes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_all, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000C${codes.length - 1}\u0000`;
  });

  const links: string[] = [];
  text = text.replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, (_all, alt: string, src: string) => {
    links.push(`<img src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`);
    return `\u0000L${links.length - 1}\u0000`;
  });
  text = text.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_all, label: string, href: string) => {
    links.push(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    return `\u0000L${links.length - 1}\u0000`;
  });
  text = text.replace(/(^|[\s(])(https?:\/\/[^\s<)\]]{4,})/g, (_all, prefix: string, url: string) => {
    const trailing = url.match(/[.,;:!?]+$/)?.[0] ?? "";
    const clean = trailing ? url.slice(0, -trailing.length) : url;
    return `${prefix}<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${trailing}`;
  });

  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  text = text.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  text = text.replace(/(^|[\s>])(\*)([^*\n]+)\2(?=[\s.,;:!?)}\]<]|$)/g, "$1<em>$3</em>");

  links.forEach((link, index) => { text = text.replace(`\u0000L${index}\u0000`, link); });
  codes.forEach((code, index) => { text = text.replace(`\u0000C${index}\u0000`, code); });
  return text;
}

const isTableSeparator = (line: string): boolean =>
  /\|/.test(line) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

/** Renderizador Markdown ligero y seguro para descripciones de mods. */
export function mdLite(source: unknown): string {
  let text = String(source ?? "").replace(/\r\n/g, "\n");
  if (!text.trim()) return "";

  const blocks: string[] = [];
  text = text.replace(/```[a-z0-9+#-]*\n?([\s\S]*?)```/gi, (_all, code: string) => {
    blocks.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    return `\n\u0000B${blocks.length - 1}\u0000\n`;
  });

  const drop = new RegExp(`<(${DROP_WITH_CONTENT})\\b[\\s\\S]*?<\\/\\1\\s*>`, "gi");
  text = text.replace(drop, "");
  const dropVoid = new RegExp(`<(${DROP_WITH_CONTENT})\\b[^>]*\\/?>`, "gi");
  text = text.replace(dropVoid, "");

  const htmlTags: string[] = [];
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, (tag) => {
    const clean = sanitizeTag(tag);
    if (!clean) return "";
    htmlTags.push(clean);
    return `\u0000H${htmlTags.length - 1}\u0000`;
  });

  text = escapeHtml(text);
  const lines = text.split("\n").map(inline);
  const out: string[] = [];
  let paragraph: string[] = [];
  let listTag: "ul" | "ol" | null = null;
  let quoteLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.join("<br>")}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listTag) out.push(`</${listTag}>`);
    listTag = null;
  };
  const closeQuote = () => {
    if (quoteLines.length) {
      out.push(`<blockquote>${quoteLines.map((line) => (line ? `<p>${line}</p>` : "")).join("")}</blockquote>`);
    }
    quoteLines = [];
  };
  const flushAll = () => { flushParagraph(); closeList(); closeQuote(); };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    const blockMatch = trimmed.match(/^\u0000B(\d+)\u0000$/);
    if (blockMatch) {
      flushAll();
      out.push(blocks[Number(blockMatch[1])] ?? "");
      continue;
    }
    if (/^(?:\u0000H\d+\u0000\s*)+$/.test(trimmed)) {
      flushAll();
      out.push(trimmed);
      continue;
    }
    if (!trimmed) { flushAll(); continue; }

    if (trimmed.includes("|") && isTableSeparator(lines[index + 1] ?? "")) {
      flushAll();
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      let cursor = index + 2;
      while (cursor < lines.length && lines[cursor].trim().includes("|") && lines[cursor].trim()) {
        if (isTableSeparator(lines[cursor])) break;
        rows.push(splitRow(lines[cursor]));
        cursor += 1;
      }
      const head = header.map((cell) => `<th>${cell}</th>`).join("");
      const body = rows
        .map((row) => `<tr>${header.map((_, position) => `<td>${row[position] ?? ""}</td>`).join("")}</tr>`)
        .join("");
      out.push(`<div class="md-table-wrap"><table><thead><tr>${head}</tr></thead>${body ? `<tbody>${body}</tbody>` : ""}</table></div>`);
      index = cursor - 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = Math.min(6, Math.max(2, heading[1].length + 1));
      out.push(`<h${level}>${heading[2]}</h${level}>`);
      continue;
    }
    if (/^([-*_])\1{2,}$/.test(trimmed)) { flushAll(); out.push("<hr>"); continue; }

    const quote = raw.match(/^\s*&gt;\s?(.*)$/);
    if (quote) { flushParagraph(); closeList(); quoteLines.push(quote[1]); continue; }
    closeQuote();

    const item = raw.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (item) {
      flushParagraph();
      const nextTag = /^\d/.test(item[2]) ? "ol" : "ul";
      if (listTag !== nextTag) { closeList(); listTag = nextTag; out.push(`<${nextTag}>`); }
      out.push(`<li>${item[3]}</li>`);
      continue;
    }
    closeList();
    paragraph.push(trimmed);
  }
  flushAll();

  return out
    .filter(Boolean)
    .join("\n")
    .replace(/\u0000H(\d+)\u0000/g, (_all, position: string) => htmlTags[Number(position)] ?? "");
}
