export function backupKey(encoded?:string):Buffer;
export function encryptBackup(bytes:Buffer,key:Buffer):Buffer;
export function decryptBackup(bytes:Buffer,key:Buffer):Buffer;
export function digest(bytes:Buffer):string;
