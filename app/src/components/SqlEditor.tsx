// Copyright 2026 Lakelet contributors
// SPDX-License-Identifier: Apache-2.0
// The SQL box (app brief A3): CodeMirror 6 with the SQL language, table and column names
// for completion, Cmd/Ctrl+Enter to run, Escape to cancel (F0.8.6).

import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { autocompletion, closeBrackets, completionKeymap } from '@codemirror/autocomplete';
import { sql, PostgreSQL } from '@codemirror/lang-sql';

export interface SqlEditorProps {
  value: string;
  onChange: (sql: string) => void;
  onRun: () => void;
  onCancel: () => void;
  /** Table name to column names, for completion. */
  schema: Record<string, string[]>;
  autoFocus?: boolean;
}

export function SqlEditor({ value, onChange, onRun, onCancel, schema, autoFocus }: SqlEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const language = useRef(new Compartment());
  const handlers = useRef({ onChange, onRun, onCancel });
  handlers.current = { onChange, onRun, onCancel };

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        syntaxHighlighting(defaultHighlightStyle),
        language.current.of(sql({ dialect: PostgreSQL, schema, upperCaseKeywords: false })),
        placeholder('select … from …   (⌘/Ctrl+Enter runs, Esc cancels)'),
        keymap.of([
          ...completionKeymap, // first, so Escape closes an open completion before it means cancel
          { key: 'Mod-Enter', run: () => { handlers.current.onRun(); return true; } },
          { key: 'Escape', run: () => { handlers.current.onCancel(); return true; } },
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((u) => { if (u.docChanged) handlers.current.onChange(u.state.doc.toString()); }),
        EditorView.theme({
          '&': { fontSize: '13.5px', fontFamily: 'var(--mono)' },
          '.cm-content': { fontFamily: 'var(--mono)', minHeight: '96px', padding: '8px 0' },
          '.cm-line': { padding: '0 8px' },
          '.cm-gutter.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 10px' },
          '.cm-gutters': { background: 'var(--bg)', color: 'var(--muted)', border: 'none' },
          '&.cm-focused': { outline: 'none' },
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    if (autoFocus) v.focus();
    return () => { v.destroy(); view.current = undefined; };
  }, []); // created once; the schema and the value are pushed in below

  useEffect(() => {
    view.current?.dispatch({ effects: language.current.reconfigure(sql({ dialect: PostgreSQL, schema, upperCaseKeywords: false })) });
  }, [schema]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div className="sql-editor" ref={host} data-testid="sql-editor" />;
}
