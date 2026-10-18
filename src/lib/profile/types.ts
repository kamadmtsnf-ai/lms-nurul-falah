export type ProfileData = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  email_verified_at: string | null;
  status: string;
  created_at: string;
  school: string | null;
  school_name: string | null;
  roles: string[];
  is_student: boolean;
  is_teacher: boolean;
  phone: string;
  nip: string;
  npk: string;
  nik: string;
  nik_masked: string;
  has_nik: boolean;
  has_photo: boolean;
  revision: number;
  server_now: string;
  next: Record<
    "name" | "identity" | "username" | "email" | "photo",
    string | null
  >;
  student_number: string | null;
  staff_code: string | null;
  classrooms: { id: string; name: string; year: string; semester: number }[];
  guardians: {
    id: string;
    full_name: string;
    relationship: string;
    phone: string;
  }[];
  children: { id: string; full_name: string; relationship: string }[];
  duties: { kind: string; detail: string; weekdays: number[] | null }[];
};
