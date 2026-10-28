# Phase 05 — accepted file types

The backend checks the filename extension and declared MIME type before it issues an upload URL, then checks the stored bytes before marking the object READY. R2 metadata and ETag are not treated as proof of the file type. The server streams the stored object to calculate SHA-256 while retaining only a bounded prefix for format detection.

| Format | Required extension(s) | MIME type |
|---|---|---|
| PDF | `.pdf` | `application/pdf` |
| JPEG | `.jpg`, `.jpeg` | `image/jpeg` |
| PNG | `.png` | `image/png` |
| GIF | `.gif` | `image/gif` |
| WebP | `.webp` | `image/webp` |
| Word Open XML | `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Excel Open XML | `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| PowerPoint Open XML | `.pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |

SVG, HTML, scripts, macro-enabled Office documents, archives, and files whose detected type does not match the declaration are rejected. Type detection identifies a container format; it does not scan for malware or prove the document is safe to open. Add antivirus/content-disarm scanning before broadening this allowlist for higher-risk workflows.
