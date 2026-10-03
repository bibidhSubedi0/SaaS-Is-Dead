import React from 'react';

interface RichTextProps {
  text: string;
  className?: string;
}

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Regex matches: **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // bold
      parts.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
    } else if (match[3]) {
      // italic
      parts.push(<em key={key++}>{match[3]}</em>);
    } else if (match[4]) {
      // inline code
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 rounded bg-[var(--color-bg-secondary)] text-[var(--color-accent)] text-[0.9em] font-mono">
          {match[4]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export default function RichText({ text, className }: RichTextProps) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block: ```
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={key++} className="my-2 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-4 overflow-x-auto text-sm leading-relaxed text-left">
          <code className="font-mono text-[var(--color-text-primary)] whitespace-pre-wrap break-words">{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />);
      i++;
      continue;
    }

    // Regular text line
    elements.push(
      <div key={key++} className="leading-relaxed">
        {parseInline(line)}
      </div>
    );
    i++;
  }

  return (
    <div className={className}>
      {elements}
    </div>
  );
}
