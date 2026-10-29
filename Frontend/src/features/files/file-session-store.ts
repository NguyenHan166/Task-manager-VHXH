// In-memory store for session file Object URLs (valid only in current browser session)
const sessionFileStore = new Map<string, { file: File; objectUrl: string }>();

export function setSessionFile(fileId: string, file: File): string {
  // Revoke old URL if any
  const existing = sessionFileStore.get(fileId);
  if (existing) {
    try {
      URL.revokeObjectURL(existing.objectUrl);
    } catch {
      // ignore
    }
  }
  const objectUrl = URL.createObjectURL(file);
  sessionFileStore.set(fileId, { file, objectUrl });
  return objectUrl;
}

export function getSessionFile(fileId: string): { file: File; objectUrl: string } | null {
  return sessionFileStore.get(fileId) || null;
}

export function getSessionFileUrl(fileId: string): string | null {
  const item = sessionFileStore.get(fileId);
  return item ? item.objectUrl : null;
}

export const ALLOWED_EXTENSIONS = [
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
];

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB default

export function validateSelectedFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Dung lượng tệp (${(file.size / 1024 / 1024).toFixed(1)} MB) vượt quá giới hạn 20 MB.`,
    };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Định dạng .${ext} không được hỗ trợ. Chỉ chấp nhận: PDF, Word (DOCX), Excel (XLSX), PowerPoint (PPTX), Hình ảnh (JPG/PNG/GIF/WEBP).`,
    };
  }

  return { valid: true };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileCategoryIcon(mimeOrName: string): "pdf" | "word" | "excel" | "powerpoint" | "image" | "file" {
  const lower = mimeOrName.toLowerCase();
  if (lower.includes("pdf")) return "pdf";
  if (lower.includes("word") || lower.endsWith(".doc") || lower.endsWith(".docx")) return "word";
  if (lower.includes("sheet") || lower.includes("excel") || lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "excel";
  if (lower.includes("presentation") || lower.includes("powerpoint") || lower.endsWith(".ppt") || lower.endsWith(".pptx")) return "powerpoint";
  if (lower.includes("image") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png")) return "image";
  return "file";
}
