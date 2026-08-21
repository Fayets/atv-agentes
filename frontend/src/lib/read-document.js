const TEXT_EXT = [".md", ".txt", ".csv", ".json"];
const ACCEPT_EXT = [".md", ".txt", ".pdf", ".docx"];
const MAX_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_ACCEPT = ACCEPT_EXT.join(",");

export function documentError(file) {
  if (!file) return "Seleccioná un archivo.";
  const lower = file.name.toLowerCase();
  if (!ACCEPT_EXT.some((ext) => lower.endsWith(ext))) return "Solo .md, .txt, .docx o .pdf.";
  if (file.size > MAX_BYTES) return "Máximo 10MB.";
  return "";
}

export async function fileToBase64(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export async function fileToApiAttachment(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return {
      name: file.name,
      media_type: "application/pdf",
      data: await fileToBase64(file),
    };
  }
  return null;
}

export async function readDocumentFile(file) {
  const lower = file.name.toLowerCase();
  if (TEXT_EXT.some((ext) => lower.endsWith(ext))) {
    return (await file.text()).trim();
  }
  return `[Archivo adjunto: ${file.name}]`;
}
