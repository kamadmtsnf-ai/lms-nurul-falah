import {test} from "node:test";
import assert from "node:assert/strict";
import {getActivationState} from "../src/lib/auth/state";
import {validateUpload} from "../src/lib/upload-policy";
import {publicEnvSchema} from "../src/lib/env";
test("akun nonaktif dan penggantian password diprioritaskan",()=>{
 assert.equal(getActivationState({status:"disabled",must_change_password:true,email_verified_at:null}),"disabled");
 assert.equal(getActivationState({status:"active",must_change_password:true,email_verified_at:"2026-10-17"}),"change-password");
 assert.equal(getActivationState({status:"active",must_change_password:false,email_verified_at:null}),"verify-email");
 assert.equal(getActivationState({status:"active",must_change_password:false,email_verified_at:"2026-10-17"}),"active");
});
test("batas unggahan tepat pada ambang",()=>{
 assert.equal(validateUpload("image","image/png",3_000_000).ok,true);
 assert.equal(validateUpload("image","image/png",3_000_001).ok,false);
 assert.equal(validateUpload("document","application/pdf",5_000_000).ok,true);
 assert.equal(validateUpload("document","application/pdf",5_000_001).ok,false);
 assert.equal(validateUpload("video","video/mp4",4_999_999).ok,true);
 assert.equal(validateUpload("video","video/mp4",5_000_000).ok,false);
 assert.equal(validateUpload("audio","audio/mpeg",5_000_000).ok,false);
 assert.equal(validateUpload("image","text/html",100).ok,false);
 assert.equal(validateUpload("image","image/png",-1).ok,false);
});
test("secret key tidak diterima sebagai konfigurasi publik",()=>{
 assert.equal(publicEnvSchema.safeParse({NEXT_PUBLIC_SUPABASE_URL:"https://example.supabase.co",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_secret_should_never_be_public"}).success,false);
 assert.equal(publicEnvSchema.safeParse({NEXT_PUBLIC_SUPABASE_URL:"https://example.supabase.co",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"eyJhbGciOiJIUzI1NiJ9.service_role.token"}).success,false);
});

test("konfigurasi URL kosong atau rusak ditolak tanpa melempar error",()=>{
 for(const value of ["", "not-a-url", "http://example.com", "ftp://localhost"]) {
  assert.equal(publicEnvSchema.safeParse({NEXT_PUBLIC_SUPABASE_URL:value,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_example_key"}).success,false);
 }
});
