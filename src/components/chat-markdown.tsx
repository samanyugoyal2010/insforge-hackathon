"use client";

import "katex/dist/katex.min.css";

import { cn } from "@/lib/utils";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/** Map common LaTeX delimiters to remark-math $ / $$ (models often emit \\( \\) or \\[ \\]). */
function normalizeMathDelimiters(text: string): string {
  let s = text;
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, body: string) => `\n$$\n${body.trim()}\n$$\n`);
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, body: string) => `$${body.trim()}$`);
  return s;
}

/** Put list items on their own line after **Section:** (common model one-line habit). */
function normalizeInlineListBreaks(text: string): string {
  return text.replace(/(\*\*[^*\n]+\*\*)\s+(?=-\s)/g, "$1\n");
}

const mdComponents: Components = {
  p: ({ children }) => (
    <p className="my-2 text-zinc-300 first:mt-0 last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-zinc-100">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-zinc-200">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-4 text-zinc-300">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-4 text-zinc-300">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-base font-semibold text-zinc-100 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-[15px] font-semibold text-zinc-100 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-2 text-[13px] font-semibold text-zinc-200 first:mt-0">
      {children}
    </h3>
  ),
  code: ({ className, children, ...props }) => {
    const inline = !className;
    if (inline) {
      return (
        <code
          className="rounded bg-zinc-800/90 px-1 py-0.5 font-mono text-[12px] text-zinc-200"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md border border-zinc-700/80 bg-zinc-950/90 p-3 font-mono text-[12px] text-zinc-300">
      {children}
    </pre>
  ),
  a: ({ href, children, ...props }) => (
    <a
      href={href}
      className="text-sky-400 underline decoration-sky-400/50 underline-offset-2 hover:text-sky-300"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-zinc-600 pl-3 text-zinc-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-zinc-700/80" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[12px] text-zinc-300">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-700 bg-zinc-800/80 px-2 py-1.5 font-medium text-zinc-100">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-zinc-700/80 px-2 py-1.5">{children}</td>
  ),
};

export function ChatMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const source = normalizeMathDelimiters(
    normalizeInlineListBreaks(content.trim() || ""),
  );

  return (
    <div
      className={cn(
        "chat-markdown text-[13px] leading-relaxed",
        "[&_.katex]:text-zinc-200 [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              errorColor: "#f87171",
              throwOnError: false,
              strict: false,
            },
          ],
        ]}
        components={mdComponents}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
