const TEXT_EXT = [".md", ".txt", ".csv", ".json"];
const DOC_EXT = [".md", ".txt", ".pdf", ".docx"];

/** Formatos de imagen que acepta la API de Claude. */
const IMAGE_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const IMAGE_EXT = Object.keys(IMAGE_TYPES);

const ACCEPT_EXT = [...DOC_EXT, ...IMAGE_EXT];
const MAX_BYTES = 10 * 1024 * 1024;
/** La API rechaza imágenes de más de 5MB en base64. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const DOCUMENT_ACCEPT = ACCEPT_EXT.join(",");

function extOf(file) {
  const lower = String(file?.name || "").toLowerCase();
  return ACCEPT_EXT.find((ext) => lower.endsWith(ext)) || "";
}

export function isImage(file) {
  return Boolean(IMAGE_TYPES[extOf(file)]);
}

export function documentError(file) {
  if (!file) return "Seleccioná un archivo.";
  const ext = extOf(file);
  if (!ext) return "Solo .md, .txt, .docx, .pdf o imágenes (.png, .jpg, .webp).";
  if (IMAGE_TYPES[ext] && file.size > MAX_IMAGE_BYTES) return "Las imágenes van hasta 5MB.";
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

/**
 * Devuelve el adjunto tal como lo espera la API, o null si el archivo
 * se manda como texto extraído en vez de como binario.
 */
export async function fileToApiAttachment(file) {
  const ext = extOf(file);
  const mediaType = IMAGE_TYPES[ext] || (ext === ".pdf" ? "application/pdf" : "");
  if (!mediaType) return null;
  return { name: file.name, media_type: mediaType, data: await fileToBase64(file) };
}

export async function readDocumentFile(file) {
  const ext = extOf(file);
  if (TEXT_EXT.includes(ext)) return (await file.text()).trim();
  if (IMAGE_TYPES[ext]) return `[Imagen adjunta: ${file.name}]`;
  return `[Archivo adjunto: ${file.name}]`;
}
