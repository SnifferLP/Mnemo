import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * Markdown renderer used for card sides, notes and AI answers.
 * Raw HTML is intentionally not rendered, so imported content cannot inject
 * markup into the webview.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("mnemo-markdown text-[14px] leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold">{children}</h4>,
          code: ({ className: cls, children }) => {
            const isBlock = cls?.includes("language-");
            return isBlock ? (
              <code className="block overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[12.5px]">
                {children}
              </code>
            ) : (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>
            );
          },
          pre: ({ children }) => <pre className="mb-2">{children}</pre>,
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-primary/40 pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-2 py-1.5 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border-b border-border/60 px-2 py-1.5">{children}</td>,
          hr: () => <hr className="my-3 border-border" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
