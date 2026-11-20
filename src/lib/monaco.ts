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
    { token: "comment", foreground: "8c847c", fontStyle: "italic" },
    { token: "type", foreground: "c74a2e" },
    { token: "variable", foreground: "8a4a32" },
    { token: "string", foreground: "6e8a5b" },
    { token: "keyword", foreground: "a5432a" },
    { token: "number", foreground: "9a6b2f" },
    { token: "operator", foreground: "7c766f" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#232c3a",
    "editorLineNumber.foreground": "#bdb6ae",
    "editorLineNumber.activeForeground": "#7c766f",
    "editor.lineHighlightBackground": "#faf8f6",
    "editorCursor.foreground": "#c74a2e",
    "editor.selectionBackground": "#f3ded6",
    "editorIndentGuide.background1": "#e8e1db",
    "editorGutter.background": "#ffffff",
    "editorWidget.background": "#ffffff",
    "editorWidget.border": "#e8e1db",
  },
});

monaco.editor.defineTheme("packwright-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "7e8798", fontStyle: "italic" },
    { token: "type", foreground: "e8704a" },
    { token: "variable", foreground: "e39a7a" },
    { token: "string", foreground: "a8c48f" },
    { token: "keyword", foreground: "f08a66" },
    { token: "number", foreground: "e0b071" },
    { token: "operator", foreground: "a6adba" },
  ],
  colors: {
    "editor.background": "#232c3a",
    "editor.foreground": "#f0f1f5",
    "editorLineNumber.foreground": "#5b6778",
    "editorLineNumber.activeForeground": "#a6adba",
    "editor.lineHighlightBackground": "#2b3544",
    "editorCursor.foreground": "#e8704a",
    "editor.selectionBackground": "#5a3a2e",
    "editorIndentGuide.background1": "#3a4656",
    "editorGutter.background": "#232c3a",
    "editorWidget.background": "#2b3544",
    "editorWidget.border": "#3a4656",
  },
});

export { monaco };
