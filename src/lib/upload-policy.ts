export type UploadKind = "image" | "document" | "audio" | "video";
const allowed: Record<UploadKind, readonly string[]> = {
 image: ["image/jpeg", "image/png", "image/webp"],
 document: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
 audio: ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav"],
 video: ["video/mp4", "video/webm"],
};
export function validateUpload(kind: UploadKind, mime: string, bytes: number) {
 if (!Number.isSafeInteger(bytes) || bytes <= 0) return {ok:false, reason:"Ukuran berkas tidak valid."};
 if (!allowed[kind].includes(mime)) return {ok:false, reason:"Format berkas tidak diizinkan."};
 const limit = kind === "image" ? 3_000_000 : 5_000_000;
 const exceeds = kind === "audio" || kind === "video" ? bytes >= limit : bytes > limit;
 return exceeds ? {ok:false, reason: kind === "audio" || kind === "video" ? "Gunakan tautan untuk media berukuran 5 MB atau lebih." : "Ukuran berkas melebihi batas."} : {ok:true, reason:null};
}
// Batas aplikasi saja. Tahap unggahan wajib menambahkan pemeriksaan signature dan izin objek di server.
