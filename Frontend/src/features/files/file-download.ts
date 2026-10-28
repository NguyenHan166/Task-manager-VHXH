import type { FileObject } from "../../shared/data-contract";
import { httpRepository, isMockMode } from "../../shared/repository";
import { getSessionFileUrl } from "./file-session-store";

export async function downloadFile(file: FileObject): Promise<void> {
  const url = isMockMode
    ? getSessionFileUrl(file.id)
    : await httpRepository.getDownloadUrl(file.id);
  if (!url) throw new Error("Tệp này chưa có dữ liệu để tải.");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Không tải được tệp (HTTP ${response.status}).`);
  const blobUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = file.originalName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
}
