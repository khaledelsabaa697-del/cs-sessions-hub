"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { inputClass, labelClass } from "@/components/ui";

type SessionOption = {
  id: string;
  label: string;
};

export function HrSessionSelect({
  label,
  placeholder,
  sessions,
  selectedId,
}: {
  label: string;
  placeholder: string;
  sessions: SessionOption[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set("session", value);
    else params.delete("session");
    const query = params.toString();
    startTransition(() => router.push(query ? `?${query}` : "?"));
  }

  return (
    <div>
      <label htmlFor="hr-session-select" className={labelClass}>
        {label}
      </label>
      <select
        id="hr-session-select"
        className={inputClass}
        value={selectedId ?? ""}
        disabled={pending}
        onChange={(event) => handleChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.label}
          </option>
        ))}
      </select>
    </div>
  );
}
