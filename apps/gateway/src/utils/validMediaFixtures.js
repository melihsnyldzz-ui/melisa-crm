// Pure synthetic fixtures for format tests. Production modules never import this.
import { deflateSync, deflateRawSync } from 'node:zlib';
const jpegBase64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8rZ55LmaSaaRpZZGLvI7EszE5JJPUmiiis6fwL0OvF/7xU/xP8z//2Q==';
function crc32(bytes) {
  let crc=0xffffffff; for (const byte of bytes) { crc^=byte; for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); } return (crc^0xffffffff)>>>0;
}
export function pngChunk(type,body) {
  const size=Buffer.alloc(4),crc=Buffer.alloc(4),name=Buffer.from(type); size.writeUInt32BE(body.length); crc.writeUInt32BE(crc32(Buffer.concat([name,body])));
  return Buffer.concat([size,name,body,crc]);
}
export function validPng() {
  const header=Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(2,4); header[8]=8; header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(Buffer.from([0,255,0,0,0,255,0,0,0,0,255,255,255,255]))),pngChunk('IEND',Buffer.alloc(0))]);
}
export function validPdf(label = 'Synthetic test only') {
  const stream='BT /F1 12 Tf 40 720 Td ('+label+') Tj ET\n';
  const values=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'endstream'];
  let text='%PDF-1.4\n'; const offsets=[];
  values.forEach((value,i)=>{ offsets.push(Buffer.byteLength(text)); text+=(i+1)+' 0 obj\n'+value+'\nendobj\n'; });
  const xref=Buffer.byteLength(text); text+='xref\n0 6\n0000000000 65535 f \n';
  offsets.forEach(offset=>{ text+=String(offset).padStart(10,'0')+' 00000 n \n'; });
  text+='trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n'; return Buffer.from(text);
}
export function validPdfXrefStream(predictor = false) {
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>'];
  let content='',header=''; objects.forEach((value,i)=>{ header+=(i+1)+' '+Buffer.byteLength(content)+' '; content+=value+' '; });
  const compressed=deflateSync(Buffer.from(header+content));
  let file=Buffer.from('%PDF-1.7\n'),first=file.length;
  file=Buffer.concat([file,Buffer.from('4 0 obj\n<< /Type /ObjStm /N 3 /First '+Buffer.byteLength(header)+' /Length '+compressed.length+' /Filter /FlateDecode >>\nstream\n'),compressed,Buffer.from('\nendstream\nendobj\n')]);
  const xref=file.length,records=Buffer.alloc(42);
  const values=[[0,0,65535],[2,4,0],[2,4,1],[2,4,2],[1,first,0],[1,xref,0]];
  values.forEach((value,i)=>{ records[i*7]=value[0]; records.writeUInt32BE(value[1],i*7+1); records.writeUInt16BE(value[2],i*7+5); });
  let data=records;
  if(predictor) {
    data=Buffer.alloc(48); for(let row=0;row<6;row++) { data[row*8]=2; for(let col=0;col<7;col++) data[row*8+1+col]=(records[row*7+col]-(row?records[(row-1)*7+col]:0)+256)&255; }
  }
  data=deflateSync(data);
  const params=predictor?' /DecodeParms << /Predictor 12 /Columns 7 /Colors 1 /BitsPerComponent 8 >>':'';
  return Buffer.concat([file,Buffer.from('5 0 obj\n<< /Type /XRef /W [1 4 2] /Size 6 /Root 1 0 R /Length '+data.length+' /Filter /FlateDecode'+params+' >>\nstream\n'),data,Buffer.from('\nendstream\nendobj\nstartxref\n'+xref+'\n%%EOF\n')]);
}
function zip(parts, deflated = false) {
  const local=[],central=[]; let offset=0;
  for (const [name,text] of Object.entries(parts)) {
    const data=Buffer.from(text),packed=deflated?deflateRawSync(data):data,label=Buffer.from(name),header=Buffer.alloc(30),directory=Buffer.alloc(46),crc=crc32(data);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt32LE(crc,14);
    header.writeUInt16LE(deflated?8:0,8); header.writeUInt32LE(packed.length,18); header.writeUInt32LE(data.length,22); header.writeUInt16LE(label.length,26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20,4); directory.writeUInt16LE(20,6);
    directory.writeUInt16LE(deflated?8:0,10); directory.writeUInt32LE(crc,16); directory.writeUInt32LE(packed.length,20); directory.writeUInt32LE(data.length,24);
    directory.writeUInt16LE(label.length,28); directory.writeUInt32LE(offset,42);
    local.push(header,label,packed); central.push(directory,label); offset+=header.length+label.length+packed.length;
  }
  const end=Buffer.alloc(22),table=Buffer.concat(central); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(parts).length,8);
  end.writeUInt16LE(Object.keys(parts).length,10); end.writeUInt32LE(table.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,table,end]);
}
export function validOffice(kind='docx',patch={},deflated=false) {
  const main=kind==='docx'?'word/document.xml':'xl/workbook.xml',type=kind==='docx'?'wordprocessingml.document':'spreadsheetml.sheet';
  const parts={
    '[Content_Types].xml':'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/'+main+'" ContentType="application/vnd.openxmlformats-officedocument.'+type+'.main+xml"/></Types>',
    '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="'+main+'"/></Relationships>',
  };
  if(kind==='docx') parts[main]='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic</w:t></w:r></w:p></w:body></w:document>';
  else {
    parts[main]='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthetic" sheetId="1" r:id="rId1"/></sheets></workbook>';
    parts['xl/_rels/workbook.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
    parts['xl/worksheets/sheet1.xml']='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Synthetic</t></is></c></row></sheetData></worksheet>';
  }
  return zip({...parts,...patch},deflated);
}
function validDoc() {
  const bytes=Buffer.alloc(512*19); Buffer.from([208,207,17,224,161,177,26,225]).copy(bytes);
  bytes.writeUInt16LE(0x003e,24); bytes.writeUInt16LE(3,26); bytes.writeUInt16LE(0xfffe,28); bytes.writeUInt16LE(9,30); bytes.writeUInt16LE(6,32);
  bytes.writeUInt32LE(1,44); bytes.writeUInt32LE(1,48); bytes.writeUInt32LE(4096,56); bytes.writeUInt32LE(0xfffffffe,60); bytes.writeUInt32LE(0xfffffffe,68);
  for(let i=0;i<109;i++) bytes.writeUInt32LE(i===0?0:0xffffffff,76+4*i);
  for(let i=0;i<128;i++) bytes.writeUInt32LE(0xffffffff,512+4*i);
  bytes.writeUInt32LE(0xfffffffd,512); bytes.writeUInt32LE(0xfffffffe,516);
  for(let i=2;i<=9;i++) bytes.writeUInt32LE(i===9?0xfffffffe:i+1,512+4*i);
  for(let i=10;i<=17;i++) bytes.writeUInt32LE(i===17?0xfffffffe:i+1,512+4*i);
  const directory=(index,name,type,start,size)=>{
    const at=1024+index*128,label=Buffer.from(name+'\0','utf16le'); label.copy(bytes,at); bytes.writeUInt16LE(label.length,at+64); bytes[at+66]=type; bytes[at+67]=1;
    bytes.writeUInt32LE(0xffffffff,at+68); bytes.writeUInt32LE(0xffffffff,at+72); bytes.writeUInt32LE(type===5?1:0xffffffff,at+76);
    bytes.writeUInt32LE(start,at+116); bytes.writeBigUInt64LE(BigInt(size),at+120);
  };
  directory(0,'Root Entry',5,0xfffffffe,0); directory(1,'WordDocument',2,2,4096); directory(2,'0Table',2,10,4096);
  bytes.writeUInt32LE(2,1024+128+72);
  const at=1536; bytes.writeUInt16LE(0xa5ec,at); bytes.writeUInt16LE(0x00c1,at+2); bytes.writeUInt32LE(900,at+24); bytes.writeUInt32LE(902,at+28); bytes[at+900]=13;
  return bytes;
}
function validOgg() {
  const page=(sequence,flags,data)=>{
    const bytes=Buffer.alloc(28+data.length); bytes.write('OggS'); bytes[5]=flags; bytes.writeUInt32LE(1,14); bytes.writeUInt32LE(sequence,18); bytes[26]=1; bytes[27]=data.length; data.copy(bytes,28);
    let crc=0; for(const byte of bytes){ crc^=byte<<24; for(let i=0;i<8;i++) crc=(crc<<1)^((crc&0x80000000)?0x04c11db7:0); } bytes.writeUInt32LE(crc>>>0,22); return bytes;
  };
  const header=Buffer.alloc(19); header.write('OpusHead'); header[8]=1; header[9]=1; header.writeUInt32LE(48000,12);
  const tags=Buffer.alloc(16); tags.write('OpusTags');
  return Buffer.concat([page(0,2,header),page(1,0,tags),page(2,4,Buffer.from([248,255,254]))]);
}
function validWav() {
  const bytes=Buffer.alloc(46); bytes.write('RIFF'); bytes.writeUInt32LE(38,4); bytes.write('WAVEfmt ',8); bytes.writeUInt32LE(16,16);
  bytes.writeUInt16LE(1,20); bytes.writeUInt16LE(1,22); bytes.writeUInt32LE(8000,24); bytes.writeUInt32LE(16000,28); bytes.writeUInt16LE(2,32); bytes.writeUInt16LE(16,34);
  bytes.write('data',36); bytes.writeUInt32LE(2,40); return bytes;
}
function box(type,...values) { const data=Buffer.concat(values),header=Buffer.alloc(8); header.writeUInt32BE(data.length+8); header.write(type,4); return Buffer.concat([header,data]); }
export function validMp4(video=false) {
  const handler=Buffer.alloc(24); handler.write(video?'vide':'soun',8);
  return Buffer.concat([box('ftyp',Buffer.from('isom\0\0\0\0isommp42')),
    box('moov',box('trak',box('mdia',box('hdlr',handler)))),box('mdat',Buffer.from([33,16,4,96,140,28]))]);
}
export const fixtureMimes=['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/ogg','audio/mpeg','audio/mp4','audio/wav','video/mp4'];
export function validMediaBytes(mime) {
  if(mime==='image/jpeg') return Buffer.from(jpegBase64,'base64');
  if(mime==='image/png') return validPng();
  if(mime==='image/gif') return Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAkQBADs=','base64');
  if(mime==='image/webp') return Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==','base64').subarray(0,42);
  if(mime==='application/pdf') return validPdf();
  if(mime==='text/plain') return Buffer.from('Synthetic UTF-8 text: Türkçe.\n');
  if(mime==='application/msword') return validDoc();
  if(mime.includes('wordprocessingml')) return validOffice('docx');
  if(mime.includes('spreadsheetml')) return validOffice('xlsx');
  if(mime==='audio/ogg') return validOgg();
  if(mime==='audio/wav') return validWav();
  if(mime==='audio/mpeg') { const frame=Buffer.alloc(417); Buffer.from([255,251,144,0]).copy(frame); return Buffer.concat([frame,frame]); }
  if(mime==='audio/mp4'||mime==='video/mp4') return validMp4(mime==='video/mp4');
  throw new Error('Unknown synthetic fixture MIME');
}
