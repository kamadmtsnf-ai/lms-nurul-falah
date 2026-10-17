import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
const magic=Buffer.from('LMSBK1');
export function backupKey(encoded){const key=Buffer.from(encoded??'','base64');if(key.length!==32)throw new Error('LMS_BACKUP_KEY_BASE64 harus berisi kunci acak 32 byte dalam base64.');return key;}
export function encryptBackup(bytes,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(magic);return Buffer.concat([magic,iv,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);}
export function decryptBackup(bytes,key){if(bytes.length<34||!bytes.subarray(0,6).equals(magic))throw new Error('Format cadangan tidak dikenal.');const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(6,18));d.setAAD(magic);d.setAuthTag(bytes.subarray(-16));return Buffer.concat([d.update(bytes.subarray(18,-16)),d.final()]);}
export function digest(bytes){return createHash('sha256').update(bytes).digest('hex');}
