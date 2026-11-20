import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

// Monaco 100% local: sin CDN. La validación la hace Rust (file_validate),
// así que no necesitamos los workers de lenguajes de Monaco.
loader.config({ monaco });

monaco.languages.register({ id: "toml" });
monaco.languages.setMonarchTokensProvider("toml", {
  tokenizer: {
    root: [
      [/#.*$/, "comment"],
      [/\s*\[{1,2}[^\]]+\]{1,2}/, "type"],
      [/[A-Za-z0-9_-]+(?=\s*=)/, "variable"],
      [/"([^"\\]|\\.)*"/, "string"],
      [/'[^']*'/, "string"],
      [/\b(true|false)\b/, "keyword"],
      [/[+-]?\d[\d_]*(?:\.\d+)?/, "number"],
      [/=/, "operator"],
    ],
  },
});

monaco.editor.defineTheme("packwright", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "5A6484", fontStyle: "italic" },
    { token: "type", foreground: "3DDAD7" },
    { token: "variable", foreground: "A9B6FF" },
    { token: "string", foreground: "B8E986" },
    { token: "keyword", foreground: "7C5CFF" },
    { token: "number", foreground: "F0B86E" },
    { token: "operator", foreground: "8E98BC" },
  ],
  colors: {
    "editor.background": "#0c1120",
    "editor.foreground": "#dce3ff",
    "editorLineNumber.foreground": "#394263",
    "editorLineNumber.activeForeground": "#7c86a6",
    "editor.lineHighlightBackground": "#111830",
    "editorCursor.foreground": "#3ddad7",
    "editor.selectionBackground": "#2b3a6b",
    "editorIndentGuide.background1": "#1b2236",
    "editorGutter.background": "#0c1120",
  },
});

export { monaco };
