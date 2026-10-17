import {validateUpload,type UploadKind} from '../upload-policy';
const formats:Record<string,{extensions:string[];kind:UploadKind}>={
 'image/jpeg':{extensions:['jpg','jpeg'],kind:'image'},'image/png':{extensions:['png'],kind:'image'},'image/webp':{extensions:['webp'],kind:'image'},
 'application/pdf':{extensions:['pdf'],kind:'document'},'application/msword':{extensions:['doc'],kind:'document'},'application/vnd.ms-excel':{extensions:['xls'],kind:'document'},'application/vnd.ms-powerpoint':{extensions:['ppt'],kind:'document'},
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':{extensions:['docx'],kind:'document'},'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':{extensions:['xlsx'],kind:'document'},'application/vnd.openxmlformats-officedocument.presentationml.presentation':{extensions:['pptx'],kind:'document'},
 'audio/mpeg':{extensions:['mp3'],kind:'audio'},'audio/mp4':{extensions:['m4a'],kind:'audio'},'audio/ogg':{extensions:['ogg'],kind:'audio'},'audio/wav':{extensions:['wav'],kind:'audio'},'video/mp4':{extensions:['mp4'],kind:'video'},'video/webm':{extensions:['webm'],kind:'video'},
};
export function fileKind(mime:string){return formats[mime]?.kind;}
export function validateFile(meta:{name:string;kind:UploadKind;mime:string;bytes:number},data?:Buffer){
 const check=validateUpload(meta.kind,meta.mime,meta.bytes);if(!check.ok)throw new Error(check.reason!);
 const format=formats[meta.mime],extension=meta.name.split('.').pop()?.toLowerCase();
 if(!format || format.kind!==meta.kind || !extension || !format.extensions.includes(extension))throw new Error('Ekstensi dan format berkas tidak sesuai.');
 if(!data)return;
 if(data.length!==meta.bytes)throw new Error('Ukuran berkas tidak sesuai.');
 const hex=data.subarray(0,12).toString('hex'),ascii=data.subarray(0,12).toString('latin1');let valid=false;
 if(meta.mime==='image/jpeg')valid=hex.startsWith('ffd8ff');
 else if(meta.mime==='image/png')valid=hex.startsWith('89504e470d0a1a0a');
 else if(meta.mime==='image/webp')valid=ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP';
 else if(meta.mime==='application/pdf')valid=ascii.startsWith('%PDF-');
 else if(['doc','xls','ppt'].includes(extension))valid=hex.startsWith('d0cf11e0a1b11ae1');
 else if(['docx','xlsx','pptx'].includes(extension)){const marker=extension==='docx'?'word/':extension==='xlsx'?'xl/':'ppt/';valid=hex.startsWith('504b0304')&&data.includes(Buffer.from('[Content_Types].xml'))&&data.includes(Buffer.from(marker));}
 else if(meta.mime==='audio/mpeg')valid=ascii.startsWith('ID3')||(data[0]===0xff&&(data[1]&0xe0)===0xe0);
 else if(['audio/mp4','video/mp4'].includes(meta.mime))valid=ascii.slice(4,8)==='ftyp';
 else if(meta.mime==='audio/ogg')valid=ascii.startsWith('OggS');
 else if(meta.mime==='audio/wav')valid=ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WAVE';
 else if(meta.mime==='video/webm')valid=hex.startsWith('1a45dfa3');
 if(!valid)throw new Error('Isi berkas tidak sesuai dengan formatnya.');
}

export function mimeForName(name:string){const extension=name.split('.').pop()?.toLowerCase();return Object.entries(formats).find(([,v])=>!!extension&&v.extensions.includes(extension))?.[0];}
