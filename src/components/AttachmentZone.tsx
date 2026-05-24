'use client';

import { useId, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { uploadFile } from '@/lib/storage';
import { useToast } from './Toast';

type Props = {
  bucket: string;
  tenantId: string | null;
  userId: string;
  maxFiles?: number;
  label?: string;
  existingPaths?: string[];
  onChange?: (paths: { existing: string[]; staged: File[] }) => void;
};

export default function AttachmentZone({
  bucket,
  tenantId,
  userId,
  maxFiles = 5,
  label = 'Attachments',
  existingPaths: initialExisting = [],
  onChange,
}: Props) {
  const inputId = useId();
  const [existing, setExisting] = useState<string[]>(initialExisting);
  const [staged, setStaged] = useState<File[]>([]);
  const toast = useToast();

  const totalCount = existing.length + staged.length;
  const canAdd = totalCount < maxFiles;

  function emit(next: { existing: string[]; staged: File[] }) {
    onChange?.(next);
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files);
    const available = maxFiles - existing.length - staged.length;
    if (available <= 0) {
      toast(`Max ${maxFiles} attachments`, 'warn');
      return;
    }
    const next = [...staged, ...incoming.slice(0, available)];
    setStaged(next);
    emit({ existing, staged: next });
    if (incoming.length > available) {
      toast(`Only ${available} more attachment(s) allowed`, 'warn');
    }
  }

  function removeExisting(idx: number) {
    const next = existing.filter((_, i) => i !== idx);
    setExisting(next);
    emit({ existing: next, staged });
  }

  function removeStaged(idx: number) {
    const next = staged.filter((_, i) => i !== idx);
    setStaged(next);
    emit({ existing, staged: next });
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {existing.map((p, i) => (
          <Thumb
            key={`e-${p}-${i}`}
            preview={isImg(p) ? p : null}
            label={fileNameFromPath(p)}
            onRemove={() => removeExisting(i)}
          />
        ))}
        {staged.map((f, i) => (
          <StagedThumb
            key={`s-${f.name}-${i}`}
            file={f}
            onRemove={() => removeStaged(i)}
          />
        ))}
        {canAdd && (
          <label
            htmlFor={inputId}
            className="flex h-[62px] w-[62px] flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-center text-[10px]"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--tm)',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add
            <input
              id={inputId}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      <div className="text-[11px]" style={{ color: 'var(--tm)' }}>
        {totalCount}/{maxFiles} {label}
      </div>
    </div>
  );
}

function Thumb({
  preview,
  label,
  onRemove,
}: {
  preview: string | null;
  label: string;
  onRemove: () => void;
}) {
  return (
    <div
      className="relative flex h-[62px] w-[62px] flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={label} className="h-full w-full object-cover" />
      ) : (
        <span
          className="overflow-hidden break-all p-1 text-[9px]"
          style={{ color: 'var(--ts)' }}
        >
          {label}
        </span>
      )}
      <DeleteBtn onClick={onRemove} />
    </div>
  );
}

function StagedThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useMemo(
    () => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null),
    [file],
  );
  return (
    <div
      className="relative flex h-[62px] w-[62px] flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file.name} className="h-full w-full object-cover" />
      ) : (
        <span
          className="overflow-hidden break-all p-1 text-[9px]"
          style={{ color: 'var(--ts)' }}
        >
          {file.name}
        </span>
      )}
      <DeleteBtn onClick={onRemove} />
    </div>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className="absolute right-0.5 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold leading-none text-white"
      style={{ background: '#DC2626' }}
    >
      ×
    </button>
  );
}

function isImg(p: string) {
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(p);
}

function fileNameFromPath(p: string) {
  return p.split('/').pop() ?? p;
}

export async function uploadAll(
  bucket: string,
  scope: { tenant_id: string | null; user_id: string },
  staged: File[],
  existing: string[],
): Promise<string[]> {
  const supabase = createClient();
  const uploaded = [...existing];
  for (const f of staged) {
    uploaded.push(await uploadFile(supabase, bucket, f, scope));
  }
  return uploaded;
}
