import ExcelJS from 'exceljs';
import {inflateRawSync} from 'node:zlib';
import {importConfigs,parseImportRow,type ImportKind} from './import-config';
export const MAX_IMPORT_BYTES=2_000_000;
// Periksa ukuran hasil dekompresi sebelum parser membuka workbook.
export function validateXlsxArchive(bytes:Buffer){
 if(bytes.length>MAX_IMPORT_BYTES || bytes.length<22)throw new Error('Berkas Excel tidak valid atau melebihi 2 MB.');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65_557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0 || end+22+bytes.readUInt16LE(end+20)!==bytes.length)throw new Error('Gunakan berkas .xlsx yang valid.');
 const entries=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16);let pos=offset,total=0,workbook=false;
 if(entries>500 || entries===0 || bytes.readUInt16LE(end+4)!==0 || bytes.readUInt16LE(end+6)!==0)throw new Error('Arsip Excel tidak didukung.');
 for(let i=0;i<entries;i++){
  if(pos+46>end || bytes.readUInt32LE(pos)!==0x02014b50)throw new Error('Struktur Excel tidak valid.');
  total+=bytes.readUInt32LE(pos+24);const len=bytes.readUInt16LE(pos+28),extra=bytes.readUInt16LE(pos+30),comment=bytes.readUInt16LE(pos+32);
  if(total>15_000_000 || bytes.readUInt16LE(pos+8)&1 || ![0,8].includes(bytes.readUInt16LE(pos+10)))throw new Error('Isi Excel terlalu besar atau terenkripsi.');
  const compressed=bytes.readUInt32LE(pos+20),declared=bytes.readUInt32LE(pos+24),local=bytes.readUInt32LE(pos+42);
  if(local+30>offset || bytes.readUInt32LE(local)!==0x04034b50)throw new Error('Struktur isi Excel tidak valid.');
  const dataStart=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
  if(dataStart+compressed>offset)throw new Error('Ukuran isi Excel tidak valid.');
  try{
   const content=bytes.subarray(dataStart,dataStart+compressed);
   const actual=bytes.readUInt16LE(pos+10)===8?inflateRawSync(content,{maxOutputLength:Math.max(1,declared)}).length:content.length;
   if(actual!==declared)throw new Error('size mismatch');
  }catch{throw new Error('Ukuran dekompresi Excel tidak valid atau terlalu besar.');}
  const name=bytes.toString('utf8',pos+46,pos+46+len);if(name==='xl/workbook.xml')workbook=true;
  if(/vbaProject|externalLinks/i.test(name))throw new Error('Macro dan tautan workbook eksternal tidak diizinkan.');
  pos+=46+len+extra+comment;
 }
 if(!workbook || pos!==end)throw new Error('Struktur workbook tidak valid.');
}
export async function makeTemplate(kind:ImportKind){
 const config=importConfigs[kind];const wb=new ExcelJS.Workbook();wb.creator='LMS Nurul Falah';
 const sheet=wb.addWorksheet('Data',{views:[{state:'frozen',ySplit:1}]});sheet.columns=config.columns.map(key=>({header:key,key,width:key==='name'?36:24,style:{numFmt:'@'}}));
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF065F46'}};sheet.getRow(1).height=27;
 sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:config.columns.length}};
 const help=wb.addWorksheet('Petunjuk');help.getColumn(1).width=25;help.getColumn(2).width=95;
 help.addRow(['Template',config.label]);help.addRow(['Cara mengisi',config.instructions]);help.addRow(['Batas',`Berkas .xlsx maksimal 2 MB; ${kind==='users'?25:250} baris. Data baru saja (insert-only).`]);help.addRow(['Format','Isi sheet Data mulai baris 2. Pertahankan judul kolom. Jangan memakai formula. Username, kode dan nomor induk harus berupa teks.']);help.addRow(['Contoh (jangan disalin tanpa disesuaikan)','']);
 config.columns.forEach((key,i)=>help.addRow([key,config.example[i]]));help.eachRow(r=>{r.alignment={vertical:'top',wrapText:true};r.height=45;});
 const buffer=await wb.xlsx.writeBuffer();return Buffer.from(buffer);
}
export async function readImport(bytes:Buffer,kind:ImportKind){
 validateXlsxArchive(bytes);const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0]);
 const sheet=wb.getWorksheet('Data');if(!sheet)throw new Error('Sheet Data tidak ditemukan. Gunakan template aplikasi.');
 const {columns}=importConfigs[kind];const max=kind==='users'?25:250;
 if(sheet.rowCount>max+1 || sheet.columnCount>columns.length)throw new Error(`Maksimal ${max} baris dan kolom harus sesuai template. Hapus baris kosong berformat berlebihan.`);
 const cellText=(value:ExcelJS.CellValue,row:number,key:string)=>{
  if(value===null || value===undefined)return '';
  if(typeof value==='string')return value.trim();
  if(typeof value==='number' && ['semester','grade'].includes(key))return String(value);
  throw new Error(`Baris ${row}, kolom ${key}: gunakan teks biasa, tanpa formula atau angka otomatis untuk username/kode.`);
 };
 const headers=columns.map((_,i)=>cellText(sheet.getCell(1,i+1).value,1,'header'));
 if(headers.some((key,i)=>key!==columns[i]))throw new Error('Judul atau urutan kolom tidak sesuai template.');
 const rows:Record<string,unknown>[]=[];const display:Record<string,string>[]=[];const errors:{row:number;message:string}[]=[];
 for(let n=2;n<=sheet.rowCount;n++){
  try{
   const raw=Object.fromEntries(columns.map((key,i)=>[key,cellText(sheet.getCell(n,i+1).value,n,key)]));
   if(Object.values(raw).every(v=>v===''))continue;
   if(rows.length+errors.length!==n-2)throw new Error('Jangan sisakan baris kosong di antara data.');
   display.push(raw);rows.push(parseImportRow(kind,raw));
  }catch(e){const message=e instanceof Error?e.message:'Data tidak valid.';errors.push({row:n,message:message.startsWith('[')?'Kolom wajib, format atau peran tidak sesuai. Periksa petunjuk template.':message});}
 }
 if(!rows.length && !errors.length)throw new Error('Berkas belum berisi data.');
 return {rows,display,errors};
}
