import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { monaco } from "../lib/monaco";

export type Diagnostic = {
  line: number;
  column: number;
  message: string;
  severity: string;
};

type Props = {
  theme: "light" | "dark";
  path: string;
  value: string;
  diagnostics: Diagnostic[];
  onChange: (value: string) => void;
};

function languageFor(path: string): string {
  if (path.endsWith(".json") || path.endsWith(".json5")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  return "toml";
}

export default function CodeEditor({ theme, path, value, diagnostics, onChange }: Props) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

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
        severity: monaco.MarkerSeverity.Error,
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
      onMount={(editor) => { editorRef.current = editor; }}
      onChange={(next) => onChange(next ?? "")}
      options={{
        fontFamily: "Cascadia Code, Consolas, monospace",
        fontSize: 12.5,
        lineHeight: 21,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        padding: { top: 14, bottom: 14 },
        renderLineHighlight: "line",
        tabSize: 2,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
      }}
    />
  );
}
