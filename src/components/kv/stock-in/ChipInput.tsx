import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Small "type and press Enter/comma" list editor with optional one-click presets. */
export function ChipInput({
  values,
  onChange,
  placeholder,
  presets,
  transform,
  id,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  presets?: string[];
  transform?: (s: string) => string;
  id?: string;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => (transform ? transform(s.trim()) : s.trim()))
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setText("");
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-sm"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        id={id}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => add(text)}
      />
      {presets && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => add(p)}
              className="rounded border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              + {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
