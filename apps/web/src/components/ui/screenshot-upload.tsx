'use client';

import { useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { Button } from './button';

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const MAX_SIZE = 5 * 1024 * 1024;

export function ScreenshotUpload({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = async (file: File) => {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      toast.error('僅支援 PNG / JPEG / WebP / GIF');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error('檔案大小上限 5 MB');
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const { data: presign } = await apiClient.post<{
        uploadUrl: string;
        publicUrl: string;
        key: string;
      }>('/upload/case-screenshot/presign', {
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      });

      await axios.put(presign.uploadUrl, file, {
        headers: {
          'Content-Type': file.type,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });

      onChange(presign.publicUrl);
      toast.success('截圖已上傳');
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      toast.error(
        Array.isArray(msg)
          ? msg[0]
          : msg || e?.message || '上傳失敗，請稍後再試',
      );
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (value) {
    return (
      <div className="space-y-2">
        <div className="relative rounded-lg overflow-hidden border border-white/10 bg-black/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="screenshot preview" className="max-w-full max-h-80 mx-auto" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white"
            onClick={() => onChange(null)}
            disabled={disabled}
          >
            <X className="h-4 w-4 mr-1" /> 移除
          </Button>
        </div>
        <p className="text-xs text-gray-500 truncate">已上傳：{value}</p>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || disabled}
        className="w-full border-2 border-dashed border-white/15 hover:border-blue-500/40 rounded-lg p-8 flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
      >
        {uploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">上傳中… {progress}%</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8" />
            <p className="text-sm font-medium">點擊選擇截圖</p>
            <p className="text-xs">
              <ImageIcon className="h-3 w-3 inline mr-1" />
              PNG / JPEG / WebP / GIF · 上限 5 MB
            </p>
          </>
        )}
      </button>
    </div>
  );
}
