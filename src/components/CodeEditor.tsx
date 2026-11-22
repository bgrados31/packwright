import { useEffect, useMemo, useRef } from "react";
import Editor from "@monaco-editor/react";
import { monaco } from "../lib/monaco";

export type Diagnostic = {
  line: number;
  column: number;
  message: string;
  severity: string;
};

export type EditorSettings = {
  fontSize: number;
  tabSize: number;
  minimap: boolean;
  wordWrap: boolean;
};

type Props = {
  theme: "light" | "dark";
  path: string;
  value: string;
  diagnostics: Diagnostic[];
  settings: EditorSettings;
  onChange: (value: string) => void;
  onCursor?: (line: number, column: number) => void;
};

function languageFor(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json") || lower.endsWith(".json5") || lower.endsWith(".mcmeta")) return "json";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".xml")) return "xml";
  if (lower.endsWith(".log")) return "mcLog";
  if (lower.endsWith(".properties") || lower.endsWith(".cfg") || lower.endsWith(".conf") || lower.endsWith(".ini")) return "properties";
  if (lower.endsWith(".lua")) return "lua";
  if (lower.endsWith(".sh") || lower.endsWith(".bat")) return "shell";
  if (lower.endsWith(".js") || lower.endsWith(".ts")) return "javascript";
  if (lower.endsWith(".toml")) return "toml";
  return "plaintext";
}

export default function CodeEditor({ theme, path, value, diagnostics, settings, onChange, onCursor }: Props) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const { fontSize, tabSize, minimap, wordWrap } = settings;
  const options = useMemo(() => ({
    fontFamily: "Cascadia Code, Consolas, monospace",
    fontSize,
    lineHeight: Math.round(fontSize * 1.7),
    minimap: { enabled: minimap, scale: 1, showSlider: "mouseover" as const },
    wordWrap: wordWrap ? ("on" as const) : ("off" as const),
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    padding: { top: 14, bottom: 14 },
    renderLineHighlight: "all" as const,
    tabSize,
    insertSpaces: true,
    automaticLayout: true,
    folding: true,
    glyphMargin: true,
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    renderWhitespace: "selection" as const,
    occurrencesHighlight: "singleFile" as const,
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    formatOnPaste: true,
    stickyScroll: { enabled: true },
    cursorBlinking: "smooth" as const,
    cursorSmoothCaretAnimation: "on" as const,
    autoClosingBrackets: "languageDefined" as const,
    autoClosingQuotes: "languageDefined" as const,
    foldingHighlight: true,
    overviewRulerLanes: 3,
    fixedOverflowWidgets: true,
    wordWrapColumn: 100,
    lineNumbersMinChars: 4,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  }), [fontSize, tabSize, minimap, wordWrap]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      "packwright",
      diagnostics.map((d) => ({
        startLineNumber: d.line,
        startColumn: d.column,
        endLineNumber: d.line,
        endColumn: d.column + 1,
        message: d.message,
        severity:
          d.severity === "warning"
            ? monaco.MarkerSeverity.Warning
            : d.severity === "info"
              ? monaco.MarkerSeverity.Info
              : monaco.MarkerSeverity.Error,
      })),
    );
  }, [diagnostics, path]);

  return (
    <Editor
      height="520px"
      path={path}
      theme={theme === "dark" ? "packwright-dark" : "packwright-light"}
      language={languageFor(path)}
      value={value}
      onMount={(editor) => {
        editorRef.current = editor;
        editor.onDidChangeCursorPosition((event) => {
          onCursor?.(event.position.lineNumber, event.position.column);
        });
      }}
      onChange={(next) => onChange(next ?? "")}
      options={options}
    />
  );
}
