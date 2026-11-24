import type { Doc } from "@aquapro/editor-schema";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { normalizeLink } from "./link";
import { editorToDoc } from "./tiptap-to-doc";

interface Props {
  onChange: (doc: Doc) => void;
  autoFocus?: boolean;
}

/**
 * The only editor people get. Its schema contains paragraphs, one heading level, bold, italic,
 * lists, quotes, links and line breaks. There are no fonts, sizes or colors to choose, and pasted
 * content is reduced to this schema automatically.
 */
export function RichEditor({ onChange, autoFocus }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2] },
        code: false,
        codeBlock: false,
        strike: false,
        horizontalRule: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https", "mailto", "tel"],
          defaultProtocol: "https",
        },
      }),
    ],
    content: "",
    autofocus: autoFocus ? "start" : false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "editor-surface",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Text správy",
      },
    },
    onUpdate: ({ editor: e }) => onChange(editorToDoc(e.getJSON())),
  });

  if (!editor) return null;

  const button = (label: string, title: string, active: boolean, run: () => void) => (
    <button
      type="button"
      className="tool"
      aria-pressed={active}
      aria-label={title}
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
    >
      {label}
    </button>
  );

  const setLink = () => {
    const previous = (editor.getAttributes("link")["href"] as string | undefined) ?? "https://";
    const answer = window.prompt("Adresa odkazu. Prázdne pole odkaz odstráni.", previous);
    if (answer === null) return;
    if (answer.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = normalizeLink(answer);
    if (!href) {
      window.alert("Zadajte platnú adresu, napríklad https://aquapro.sk alebo meno@firma.sk.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div className="editor">
      <div className="toolbar" role="toolbar" aria-label="Formátovanie">
        {button("B", "Tučné", editor.isActive("bold"), () =>
          editor.chain().focus().toggleBold().run(),
        )}
        {button("I", "Kurzíva", editor.isActive("italic"), () =>
          editor.chain().focus().toggleItalic().run(),
        )}
        {button("Nadpis", "Nadpis", editor.isActive("heading"), () =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
        )}
        {button("• Zoznam", "Odrážky", editor.isActive("bulletList"), () =>
          editor.chain().focus().toggleBulletList().run(),
        )}
        {button("1. Zoznam", "Číslovaný zoznam", editor.isActive("orderedList"), () =>
          editor.chain().focus().toggleOrderedList().run(),
        )}
        {button("Citát", "Citát", editor.isActive("blockquote"), () =>
          editor.chain().focus().toggleBlockquote().run(),
        )}
        {button("Odkaz", "Odkaz", editor.isActive("link"), setLink)}
        <span className="toolbar-spacer" />
        {button("↶", "Späť", false, () => editor.chain().focus().undo().run())}
        {button("↷", "Znova", false, () => editor.chain().focus().redo().run())}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
