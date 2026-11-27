"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const TOKEN_PATTERN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\b|\b(?:alignas|alignof|auto|bool|break|case|catch|char|class|const|constexpr|continue|decltype|default|delete|do|double|else|enum|explicit|extern|false|float|for|friend|if|inline|int|long|mutable|namespace|new|nullptr|operator|private|protected|public|register|return|short|signed|sizeof|static|static_cast|struct|switch|template|this|throw|true|try|typedef|typename|union|unsigned|using|virtual|void|volatile|while|include|define|ifndef|endif|pragma|std|cout|cin|endl|string|vector|map|set|pair|queue|stack)\b|\b[A-Za-z_]\w*(?=\s*\())/g;

type Token = { text: string; cls: string };

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ text: line.slice(last, index), cls: "" });
    const text = match[0];
    let cls = "";
    if (text.startsWith("//") || text.startsWith("/*")) cls = "tok-com";
    else if (text.startsWith('"') || text.startsWith("'")) cls = "tok-str";
    else if (/^(0x|\d)/.test(text)) cls = "tok-num";
    else if (
      /^(include|define|ifndef|endif|pragma|std|cout|cin|endl|string|vector|map|set|pair|queue|stack)$/.test(text)
    )
      cls = "tok-type";
    else if (/^[A-Za-z_]\w*$/.test(text) && /^[A-Za-z_]\w*\s*\(/.test(line.slice(index)))
      cls = "tok-fn";
    else cls = "tok-key";
    tokens.push({ text, cls });
    last = index + text.length;
  }
  if (last < line.length) tokens.push({ text: line.slice(last), cls: "" });
  return tokens;
}

export function CodePanel({
  code,
  title = "submission.cpp",
  language = "C++",
  maxHeight = "34rem",
  showCopy = true,
  className,
}: {
  code: string;
  title?: string;
  language?: string;
  maxHeight?: string;
  showCopy?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const lines = code.split("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked
    }
  }

  return (
    <div className={cn("code-panel overflow-hidden rounded-xl", className)}>
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-rose-500/70" />
          <span className="size-2.5 rounded-full bg-amber-400/70" />
          <span className="size-2.5 rounded-full bg-emerald-500/70" />
        </span>
        <span className="ms-1 truncate font-mono text-[10px] text-slate-400">{title}</span>
        <span className="ms-auto rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-500">
          {language}
        </span>
        {showCopy ? (
          <button
            type="button"
            onClick={copy}
            className="rounded p-1 text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
            aria-label="Copy code"
          >
            {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          </button>
        ) : null}
      </div>
      <div className="overflow-auto" style={{ maxHeight }} dir="ltr">
        <pre className="min-w-max py-3 font-mono text-[12px] leading-[1.7] text-slate-200">
          <code>
            {lines.map((line, index) => (
              <span key={index} className="flex">
                <span className="editor-gutter sticky start-0 w-11 shrink-0 select-none border-e border-white/[0.06] bg-[#07101c] pe-3 text-end text-[10px] leading-[1.7]">
                  {index + 1}
                </span>
                <span className="whitespace-pre ps-4">
                  {tokenizeLine(line).map((token, tokenIndex) => (
                    <span key={tokenIndex} className={token.cls}>
                      {token.text}
                    </span>
                  ))}
                  {line.length === 0 ? " " : null}
                </span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
