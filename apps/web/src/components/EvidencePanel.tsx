import React, { useRef, useState } from "react";
import { FileIcon, FileText, Image as ImageIcon, Loader2, PlusCircle, Video, Trash2 } from "lucide-react";
import { api } from "../api.js";

function inferDocType(fileName: string): { type: string; readAsText: boolean } {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov") || lower.endsWith(".mkv") || lower.endsWith(".avi")) {
    return { type: "VIDEO", readAsText: false };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return { type: "EXCEL", readAsText: false };
  if (lower.endsWith(".csv")) return { type: "CSV", readAsText: true };
  if (lower.endsWith(".pdf")) return { type: "PDF", readAsText: false };
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return { type: "DOCX", readAsText: false };
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp")) {
    return { type: "IMAGE", readAsText: false };
  }
  if (lower.endsWith(".txt")) return { type: "TXT", readAsText: true };
  return { type: "SOP", readAsText: true };
}

function readFile(file: File, readAsText: boolean) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.onerror = reject;
    if (readAsText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

function getIconForType(type: string) {
  if (type === "VIDEO" || type === "RECORDING" || type === "DESKTOP_RECORDING") {
    return <Video size={24} style={{ color: "var(--aw-teal)" }} />;
  }
  if (type === "EXCEL" || type === "CSV") return <FileText size={24} style={{ color: "var(--aw-teal)" }} />;
  if (type === "IMAGE" || type === "SCREENSHOT") return <ImageIcon size={24} style={{ color: "var(--aw-amber)" }} />;
  return <FileIcon size={24} style={{ color: "var(--aw-coolgray)" }} />;
}

export function EvidencePanel({
  workerId,
  documents,
  onUploaded,
  onOpenDesktopReview,
}: {
  workerId: string;
  documents: any[];
  onUploaded: () => void;
  onOpenDesktopReview?: (jobId?: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; type: string }[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setUploadErrors([]);
    setUploadingFiles((prev) => [
      ...prev,
      ...files.map((file) => ({ name: file.name, type: inferDocType(file.name).type })),
    ]);

    for (const file of files) {
      const { type, readAsText } = inferDocType(file.name);

      try {
        if (type === "VIDEO") {
          const uploadRes = await api.uploadEvidenceVideo(workerId, file);
          if (uploadRes?.asset?.id) {
            const analyzeRes = await api.startEvidenceAnalysis(workerId, { assetId: uploadRes.asset.id });
            if (analyzeRes?.job?.id && onOpenDesktopReview) {
              onOpenDesktopReview(analyzeRes.job.id);
            }
          }
        } else {
          const content = await readFile(file, readAsText);
          await api.uploadDocument(workerId, { name: file.name, type, content });
        }
        onUploaded();
      } catch (e: any) {
        setUploadErrors((prev) => [...prev, `${file.name}${e?.message ? `: ${e.message}` : ""}`]);
      } finally {
        setUploadingFiles((prev) => prev.filter((upload) => upload.name !== file.name));
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="mx-auto w-full max-w-[840px]">
      <div className="mb-8 border-b pb-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <h2 className="mb-2 text-xl font-bold" style={{ color: "var(--aw-offwhite)", fontFamily: "var(--font-display)" }}>
          Evidence workspace
        </h2>
        <p className="m-0 text-sm" style={{ color: "var(--aw-coolgray)" }}>
          Autoworker extracts rules, conditions, variables, desktop interactions, and process steps from these sources.
        </p>
      </div>

      {uploadErrors.length > 0 && (
        <div
          className="mb-6 flex items-start gap-3 rounded-lg px-5 py-3.5 text-sm"
          style={{
            background: "rgba(214,64,64,0.08)",
            border: "1px solid rgba(214,64,64,0.28)",
            color: "var(--aw-offwhite)",
          }}
        >
          <div className="flex-1">
            <div className="mb-1 font-bold" style={{ color: "var(--aw-red)" }}>
              {uploadErrors.length === 1 ? "Upload failed" : `${uploadErrors.length} uploads failed`}
            </div>
            <ul className="list-disc space-y-0.5 pl-5" style={{ color: "var(--aw-coolgray)" }}>
              {uploadErrors.map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => setUploadErrors([])}
            className="shrink-0 text-xs font-bold uppercase cursor-pointer"
            style={{ color: "var(--aw-coolgray)" }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {documents.length === 0 && uploadingFiles.length === 0 && (
          <div
            className="flex flex-col items-center justify-center px-8 py-16 text-center md:col-span-2"
            style={{
              background: "rgba(255,255,255,0.015)",
              border: "1px dashed rgba(255,255,255,0.14)",
              borderRadius: 12,
            }}
          >
            <FileIcon size={40} style={{ color: "rgba(180,178,190,0.3)", marginBottom: 16 }} />
            <div className="mb-1 text-base font-bold" style={{ color: "var(--aw-offwhite)", fontFamily: "var(--font-display)" }}>
              Teach your first worker.
            </div>
            <p className="max-w-[420px] text-sm" style={{ color: "var(--aw-coolgray)" }}>
              Upload desktop recordings, video demonstrations, spreadsheets, SOPs, or screenshots. Ghost reconstructs observable steps into an autonomous workflow.
            </p>
          </div>
        )}

        {documents.map((doc, index) => (
          <div
            key={doc.id || `${doc.name}-${index}`}
            className="group flex flex-col gap-3 p-5 transition-colors"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center transition-colors"
                style={{
                  background: "rgba(255,255,255,0.035)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 8,
                }}
              >
                {getIconForType(doc.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold" style={{ color: "var(--aw-offwhite)" }}>
                  {doc.name}
                </div>
                <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--aw-coolgray)", fontFamily: "var(--font-mono)" }}>
                  <span className="font-bold text-[#00c2d4]">{doc.type}</span>
                  <span style={{ color: "rgba(180,178,190,0.25)" }}>|</span>
                  {new Date(doc.createdAt || Date.now()).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (confirm(`Delete evidence document "${doc.name}"? This will permanently purge it from worker memory.`)) {
                    try {
                      await api.deleteDocument(workerId, doc.id);
                      onUploaded();
                    } catch (err: any) {
                      alert("Failed to delete document: " + (err.message || err));
                    }
                  }
                }}
                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                title="Delete evidence document"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {(doc.type === "VIDEO" || doc.type === "DESKTOP_RECORDING" || doc.name?.match(/\.(mp4|webm|mov|mkv)$/i)) && onOpenDesktopReview && (
              <div className="pt-2 border-t border-[rgba(255,255,255,0.04)] flex justify-end">
                <button
                  onClick={() => onOpenDesktopReview(doc.parsedJson?.jobId || doc.id)}
                  className="px-3 py-1.5 rounded bg-[rgba(0,194,212,0.1)] hover:bg-[rgba(0,194,212,0.18)] border border-[rgba(0,194,212,0.3)] text-[#00c2d4] text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Video size={12} />
                  <span>Review Evidence Intelligence</span>
                </button>
              </div>
            )}
          </div>
        ))}

        {uploadingFiles.map((file, index) => (
          <div
            key={`uploading-${file.name}-${index}`}
            className="flex items-center gap-4 p-5"
            style={{
              background: "rgba(0,194,212,0.04)",
              border: "1px dashed rgba(0,194,212,0.28)",
              borderRadius: 12,
            }}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center" style={{ background: "rgba(0,194,212,0.08)", border: "1px solid rgba(0,194,212,0.18)", borderRadius: 8 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "var(--aw-teal)" }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold" style={{ color: "var(--aw-offwhite)" }}>
                {file.name}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--aw-teal)" }}>
                Evidence entering worker memory
              </div>
            </div>
          </div>
        ))}

        <label
          className="flex h-[88px] cursor-pointer items-center justify-center gap-3 p-5 transition-colors"
          style={{
            background: "transparent",
            border: "1px dashed rgba(255,255,255,0.18)",
            borderRadius: 12,
            color: "var(--aw-coolgray)",
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept=".csv,.txt,.xlsx,.xls,.pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mov,.mkv,.avi"
            className="hidden"
          />
          <PlusCircle size={20} />
          <span className="text-xs font-bold uppercase tracking-wider">Upload evidence (Video / Doc / Sheet)</span>
        </label>
      </div>
    </div>
  );
}
