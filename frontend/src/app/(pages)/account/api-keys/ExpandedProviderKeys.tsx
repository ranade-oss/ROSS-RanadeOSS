"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { supabase } from "@/app/lib/supabase";
import { getApiBaseUrl } from "@/app/lib/runtimeConfig";
import {
  accountGlassIconButtonClassName,
  accountGlassInputClassName,
} from "../accountStyles";

const API_BASE = getApiBaseUrl();
const PROVIDERS = [
  { provider: "xai", label: "xAI (Grok) API Key", placeholder: "xai-..." },
  {
    provider: "moonshot",
    label: "Moonshot AI (Kimi) API Key",
    placeholder: "sk-...",
  },
] as const;

type Provider = (typeof PROVIDERS)[number]["provider"];
type Status = Record<Provider, boolean>;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
}

export function ExpandedProviderKeys({
  approvedProviders,
}: {
  approvedProviders: string[];
}) {
  const [status, setStatus] = useState<Status>({ xai: false, moonshot: false });

  useEffect(() => {
    void (async () => {
      const response = await fetch(`${API_BASE}/user/api-keys`, {
        cache: "no-store",
        headers: { Accept: "application/json", ...(await authHeaders()) },
      });
      if (!response.ok) return;
      const body = (await response.json()) as Partial<Status>;
      setStatus({ xai: !!body.xai, moonshot: !!body.moonshot });
    })();
  }, []);

  const visible = PROVIDERS.filter((entry) =>
    approvedProviders.includes(entry.provider),
  );
  if (!visible.length) return null;

  return (
    <>
      {visible.map((entry, index) => (
        <div key={entry.provider}>
          <DirectKeyField
            label={entry.label}
            placeholder={entry.placeholder}
            hasSavedKey={status[entry.provider]}
            onSave={async (value) => {
              const response = await fetch(
                `${API_BASE}/user/api-keys/${entry.provider}`,
                {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    ...(await authHeaders()),
                  },
                  body: JSON.stringify({ api_key: value }),
                },
              );
              if (response.ok)
                setStatus((current) => ({
                  ...current,
                  [entry.provider]: !!value,
                }));
              return response.ok;
            }}
          />
          {index < visible.length - 1 && (
            <div className="mx-4 h-px bg-gray-200" />
          )}
        </div>
      ))}
    </>
  );
}

function DirectKeyField({
  label,
  placeholder,
  hasSavedKey,
  onSave,
}: {
  label: string;
  placeholder: string;
  hasSavedKey: boolean;
  onSave: (value: string | null) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (next: string | null) => {
    setSaving(true);
    try {
      const ok = await onSave(next);
      if (ok) setValue("");
      else alert(`Failed to update ${label}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-5">
      <label className="text-sm font-medium text-gray-700 block mb-2">
        {label}
      </label>
      <div className="space-y-2">
        <div className="relative flex-1">
          <Input
            type={reveal ? "text" : "password"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={hasSavedKey ? "Saved key hidden" : placeholder}
            className={`pr-10 ${accountGlassInputClassName}`}
            autoComplete="off"
            spellCheck={false}
          />
          {!!value.trim() && (
            <button
              type="button"
              onClick={() => setReveal((current) => !current)}
              className={`absolute inset-y-1 right-1.5 flex items-center ${accountGlassIconButtonClassName}`}
              aria-label={reveal ? "Hide key" : "Show key"}
            >
              {reveal ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={saving || !value.trim()}
            onClick={() => void submit(value.trim())}
            className="text-xs font-medium text-gray-700 hover:text-gray-950 disabled:text-gray-400"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {hasSavedKey && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit(null)}
              className="text-xs font-medium text-red-600 hover:text-red-700 disabled:text-red-300"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
