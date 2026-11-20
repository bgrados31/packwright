import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

// Monaco 100% local: sin CDN. La validación la hace Rust (file_validate).
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

monaco.editor.defineTheme("packwright-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "8b93a5", fontStyle: "italic" },
    { token: "type", foreground: "0f8f8a" },
    { token: "variable", foreground: "4a3ac8" },
    { token: "string", foreground: "2e7d4f" },
    { token: "keyword", foreground: "7c3aed" },
    { token: "number", foreground: "b15c00" },
    { token: "operator", foreground: "6b7280" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#17191f",
    "editorLineNumber.foreground": "#a8afbd",
    "editorLineNumber.activeForeground": "#6b7280",
    "editor.lineHighlightBackground": "#f7f8fa",
    "editorCursor.foreground": "#5b4be0",
    "editor.selectionBackground": "#e6e2ff",
    "editorIndentGuide.background1": "#e4e7ec",
    "editorGutter.background": "#ffffff",
    "editorWidget.background": "#ffffff",
    "editorWidget.border": "#e4e7ec",
  },
});

monaco.editor.defineTheme("packwright-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6f788c", fontStyle: "italic" },
    { token: "type", foreground: "5ccfc9" },
    { token: "variable", foreground: "a9a0ff" },
    { token: "string", foreground: "a9d68a" },
    { token: "keyword", foreground: "a78bfa" },
    { token: "number", foreground: "e5ad70" },
    { token: "operator", foreground: "9aa2b4" },
  ],
  colors: {
    "editor.background": "#171a21",
    "editor.foreground": "#e9ebf1",
    "editorLineNumber.foreground": "#4c5361",
    "editorLineNumber.activeForeground": "#969eaf",
    "editor.lineHighlightBackground": "#1e222b",
    "editorCursor.foreground": "#9385ff",
    "editor.selectionBackground": "#35305e",
    "editorIndentGuide.background1": "#2b303b",
    "editorGutter.background": "#171a21",
    "editorWidget.background": "#1e222b",
    "editorWidget.border": "#2b303b",
  },
});

export { monaco };
