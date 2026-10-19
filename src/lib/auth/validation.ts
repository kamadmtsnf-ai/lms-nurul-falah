import {z} from "zod";
export const DEFAULT_PASSWORD="12345678";
export const usernameSchema=z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,49}$/, "Username harus 3–50 karakter: huruf, angka, titik, garis bawah atau tanda hubung.");
export const newPasswordSchema=z.string().min(8,"Password minimal 8 karakter.").max(128,"Password maksimal 128 karakter.").refine(v=>v!==DEFAULT_PASSWORD,"Password baru tidak boleh sama dengan password awal.");
export const tokenSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Tautan tidak valid atau sudah kedaluwarsa.");
export const emailSchema=z.string().trim().toLowerCase().pipe(z.email("Email yang Anda input tidak valid. Periksa kembali alamat email Anda.").max(254));
export const schoolRoles=["admin","principal","teacher","homeroom_teacher","duty_teacher","student","guardian"] as const;
export const roleLabels:Record<string,string>={admin:"Admin / Operator",principal:"Kepala Sekolah",teacher:"Guru",homeroom_teacher:"Wali Kelas",duty_teacher:"Guru Piket",student:"Siswa",guardian:"Orang Tua / Wali"};
export const rolesSchema=z.array(z.enum(schoolRoles)).min(1).max(7).transform(v=>[...new Set(v)]);
export const createUserSchema=z.object({username:usernameSchema,name:z.string().trim().min(2).max(100),email:z.union([emailSchema,z.literal("")]).optional(),roles:rolesSchema,school:z.uuid()});
export function passwordPair(value:unknown){return z.object({password:newPasswordSchema,confirm:z.string()}).refine(v=>v.password===v.confirm,{message:"Konfirmasi password belum sama.",path:["confirm"]}).parse(value);}
export function nextFor(profile:{must_change_password:boolean;email_verified_at:string|null}){return profile.must_change_password?"/ganti-password":!profile.email_verified_at?"/verifikasi":"/ruang-belajar";}

export const adminResetSchema=z.object({school:z.uuid(),target:z.uuid(),confirmation:z.literal("RESET PASSWORD")});
