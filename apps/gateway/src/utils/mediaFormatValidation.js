import { inflateSync, inflateRawSync } from 'node:zlib';

// Bounded, local format/structure checks. No URL fetch, decoder process or antivirus claim.
const EXPANDED_LIMIT = 64 * 1024 * 1024;
const requireValid = condition => { if (!condition) throw new Error('Invalid media structure'); };
const ascii = (bytes, from, to) => bytes.toString('latin1', from, to);
const starts = (bytes, value) => bytes.subarray(0, value.length).equals(Buffer.from(value));
export function mediaCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function expand(bytes, maximum, raw = false) {
  const result = (raw ? inflateRawSync : inflateSync)(bytes, { maxOutputLength: Math.max(1, maximum), info: true });
  requireValid(result.engine.bytesWritten === bytes.length && result.buffer.length <= maximum);
  return result.buffer;
}
function dimensions(width, height) { requireValid(width > 0 && height > 0 && width * height <= 16000000); }
function png(bytes) {
  requireValid(starts(bytes, [137,80,78,71,13,10,26,10]));
  let offset = 8, header, palette = false, ended = false, idatEnded = false; const data = [];
  while (offset < bytes.length) {
    requireValid(offset + 12 <= bytes.length);
    const size = bytes.readUInt32BE(offset), end = offset + size + 12, type = ascii(bytes, offset + 4, offset + 8);
    requireValid(end <= bytes.length && /^[A-Za-z]{4}$/.test(type));
    requireValid(mediaCrc32(bytes.subarray(offset + 4, end - 4)) === bytes.readUInt32BE(end - 4));
    const body = bytes.subarray(offset + 8, end - 4);
    if (!header) { requireValid(type === 'IHDR' && size === 13); header = body; }
    else requireValid(type !== 'IHDR');
    if (type === 'PLTE') { requireValid(!data.length && size > 0 && size % 3 === 0 && size <= 768); palette = true; }
    if (type === 'IDAT') { requireValid(!idatEnded); data.push(body); }
    else if (data.length) idatEnded = true;
    if (type === 'IEND') { requireValid(size === 0 && end === bytes.length); ended = true; }
    // Unknown critical formats cannot be safely interpreted.
    requireValid(type[0] === type[0].toLowerCase() || ['IHDR','PLTE','IDAT','IEND'].includes(type));
    offset = end;
  }
  requireValid(ended && data.length);
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4), depth = header[8], color = header[9];
  dimensions(width, height);
  const channels = new Map([[0,1],[2,3],[3,1],[4,2],[6,4]]).get(color);
  requireValid(channels && (color === 3 ? [1,2,4,8] : color === 0 ? [1,2,4,8,16] : [8,16]).includes(depth));
  requireValid(header[10] === 0 && header[11] === 0 && [0,1].includes(header[12]) && (color !== 3 || palette));
  const passes = header[12] ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]];
  const rows = [];
  for (const [x,y,dx,dy] of passes) {
    const w = Math.max(0, Math.ceil((width - x) / dx)), h = Math.max(0, Math.ceil((height - y) / dy));
    if (w && h) for (let row = 0; row < h; row++) rows.push(1 + Math.ceil(w * channels * depth / 8));
  }
  const expected = rows.reduce((sum,n) => sum + n, 0); requireValid(expected <= EXPANDED_LIMIT);
  const decoded = expand(Buffer.concat(data), expected);
  requireValid(decoded.length === expected);
  let index = 0; for (const size of rows) { requireValid(decoded[index] <= 4); index += size; }
}
function jpeg(bytes) {
  requireValid(starts(bytes,[255,216]) && bytes.length >= 32);
  let at = 2, frame = false, quantization = false, huffman = false, scan = false;
  while (at < bytes.length) {
    requireValid(bytes[at++] === 255); while (bytes[at] === 255) at++;
    const marker = bytes[at++]; requireValid(marker !== undefined && marker !== 0);
    if (marker === 217) { requireValid(at === bytes.length && frame && quantization && huffman && scan); return; }
    requireValid(![216,1].includes(marker) && !(marker >= 208 && marker <= 215) && at + 2 <= bytes.length);
    const length = bytes.readUInt16BE(at); requireValid(length >= 2 && at + length <= bytes.length);
    const body = bytes.subarray(at + 2, at + length); at += length;
    if ([192,193,194].includes(marker)) {
      requireValid(!frame && body.length >= 6 && body[0] === 8 && body[5] > 0 && body.length === 6 + 3 * body[5]);
      dimensions(body.readUInt16BE(3),body.readUInt16BE(1)); frame = true;
    } else if (marker === 219) {
      let q = 0; while (q < body.length) { const precision = body[q] >> 4; requireValid(precision <= 1 && (body[q] & 15) <= 3); q += 1 + 64 * (precision + 1); }
      requireValid(q === body.length && q > 0); quantization = true;
    } else if (marker === 196) {
      let q = 0;
      while (q < body.length) {
        requireValid(q + 17 <= body.length && (body[q] >> 4) <= 1 && (body[q] & 15) <= 3);
        let symbols = 0, free = 1;
        for (let i=1;i<=16;i++) { free = free * 2 - body[q+i]; requireValid(free >= 0); symbols += body[q+i]; }
        requireValid(symbols > 0 && symbols <= 256); q += 17 + symbols;
      }
      requireValid(q === body.length); huffman = true;
    } else if (marker === 218) {
      requireValid(frame && quantization && huffman && body[0] > 0 && body.length === 4 + 2 * body[0]);
      scan = true; let entropy = 0;
      while (at < bytes.length) {
        if (bytes[at] !== 255) { at++; entropy++; continue; }
        if (bytes[at+1] === 0 || (bytes[at+1] >= 208 && bytes[at+1] <= 215)) { at += 2; entropy++; continue; }
        break;
      }
      requireValid(entropy > 0);
    }
  }
  requireValid(false);
}
function gif(bytes) {
  requireValid(['GIF87a','GIF89a'].includes(ascii(bytes,0,6)) && bytes.length >= 14);
  dimensions(bytes.readUInt16LE(6),bytes.readUInt16LE(8));
  let at = 13 + ((bytes[10] & 128) ? 3 * 2 ** ((bytes[10] & 7) + 1) : 0), frames = 0, pixels = 0;
  const blocks = () => {
    const parts = []; let size;
    do { requireValid(at < bytes.length); size = bytes[at++]; requireValid(at + size <= bytes.length); parts.push(bytes.subarray(at,at+size)); at += size; } while (size);
    return Buffer.concat(parts);
  };
  while (at < bytes.length) {
    const type = bytes[at++];
    if (type === 59) { requireValid(frames > 0 && at === bytes.length); return; }
    if (type === 33) { requireValid(at < bytes.length); at++; blocks(); continue; }
    requireValid(type === 44 && at + 9 <= bytes.length);
    const width = bytes.readUInt16LE(at+4), height = bytes.readUInt16LE(at+6), flags = bytes[at+8]; dimensions(width,height); at += 9;
    pixels += width * height; requireValid(pixels <= 16000000 && frames < 1000);
    if (flags & 128) at += 3 * 2 ** ((flags & 7) + 1);
    requireValid(at < bytes.length);
    const minimum = bytes[at++]; requireValid(minimum >= 2 && minimum <= 8);
    const compressed = blocks(); requireValid(compressed.length > 0);
    const clear = 1 << minimum, stop = clear + 1;
    let dictionary, size, next, prior = null, bits = 0, produced = 0, stopped = false, codes = 0;
    const reset = () => { dictionary = Array.from({ length:clear }, () => 1); size = minimum + 1; next = stop + 1; prior = null; };
    reset();
    while (bits + size <= compressed.length * 8) {
      requireValid(++codes <= width * height * 4 + 4096);
      let code = 0; for (let i=0;i<size;i++) code |= ((compressed[(bits+i)>>3] >> ((bits+i)&7)) & 1) << i; bits += size;
      if (code === clear) { reset(); continue; }
      if (code === stop) { stopped = true; break; }
      const length = dictionary[code] || (code === next && prior ? prior + 1 : 0); requireValid(length > 0);
      produced += length; requireValid(produced <= width * height);
      if (prior && next < 4096) { dictionary[next++] = prior + 1; if (next === 1 << size && size < 12) size++; }
      prior = length;
    }
    requireValid(stopped && produced === width * height); frames++;
  }
  requireValid(false);
}
function riff(bytes, kind) {
  requireValid(bytes.length >= 12 && ascii(bytes,0,4) === 'RIFF' && bytes.readUInt32LE(4) + 8 === bytes.length && ascii(bytes,8,12) === kind);
  const chunks = []; let at = 12;
  while (at < bytes.length) {
    requireValid(at + 8 <= bytes.length); const size = bytes.readUInt32LE(at+4), end = at + 8 + size;
    requireValid(end + (size & 1) <= bytes.length && (!(size & 1) || bytes[end] === 0));
    chunks.push({ type:ascii(bytes,at,at+4), data:bytes.subarray(at+8,end) }); at = end + (size & 1);
  }
  return chunks;
}
function webp(bytes, depth = 0) {
  requireValid(depth <= 8);
  const chunks = riff(bytes,'WEBP'), images = [];
  for (const { type,data } of chunks) {
    if (type === 'VP8 ') {
      requireValid(data.length >= 11 && !(data[0] & 1) && ascii(data,3,6) === '\x9d\x01\x2a');
      dimensions(data.readUInt16LE(6) & 16383,data.readUInt16LE(8) & 16383);
      requireValid((data.readUIntLE(0,3) >> 5) > 0 && (data.readUIntLE(0,3) >> 5) <= data.length - 3); images.push(type);
    } else if (type === 'VP8L') {
      requireValid(data.length >= 7 && data[0] === 47 && (data[4] >> 5) === 0);
      const value = data.readUInt32LE(1); dimensions((value & 16383)+1,((value >> 14)&16383)+1); images.push(type);
    } else if (type === 'VP8X') requireValid(data.length === 10 && !(data[0] & 193));
    else if (type === 'ANMF') {
      requireValid(data.length >= 24);
      const nested = Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),data.subarray(16)]);
      nested.writeUInt32LE(nested.length - 8,4); webp(nested, depth + 1); images.push(type);
    } else requireValid(['ICCP','ALPH','ANIM','EXIF','XMP '].includes(type));
  }
  requireValid(images.length > 0);
}
function pdf(bytes) {
  const text = ascii(bytes,0,bytes.length);
  requireValid(/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(text) && bytes.length >= 80);
  const tail = /startxref\s+(\d+)\s+%%EOF[\r\n\t ]*$/.exec(text); requireValid(tail);
  const xrefOffset = Number(tail[1]); requireValid(xrefOffset > 0 && xrefOffset < tail.index);
  // Conservative active content policy, including escaped PDF names.
  const names = text.replace(/#([0-9a-f]{2})/gi, (_,hex) => String.fromCharCode(parseInt(hex,16)));
  requireValid(!/\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|Encrypt)\b/.test(names));
  const objects = new Map(), streams = [];
  const objectPattern = /(?:^|[\r\n])(\d+)\s+(\d+)\s+obj\b/g;
  let match;
  while ((match = objectPattern.exec(text))) {
    const start = match.index + (text[match.index] === '\r' || text[match.index] === '\n' ? 1 : 0);
    let end = text.indexOf('endobj',objectPattern.lastIndex); requireValid(end >= 0);
    const prefix=text.slice(objectPattern.lastIndex,end), firstStream=/stream\r?\n/.exec(prefix);
    if (firstStream) {
      const direct=/\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(prefix.slice(0,firstStream.index));
      if (direct) {
        const afterPayload=objectPattern.lastIndex+firstStream.index+firstStream[0].length+Number(direct[1]);
        const ending=/^[\r\n]*endstream\s+endobj\b/.exec(text.slice(afterPayload));
        requireValid(ending); end=afterPayload+ending[0].lastIndexOf('endobj');
      }
    }
    const body = text.slice(objectPattern.lastIndex,end);
    const stream = /stream\r?\n/.exec(body);
    if (stream) {
      const length = /\/Length\s+(\d+)(?!\s+\d+\s+R)\b/.exec(body.slice(0,stream.index));
      // Indirect lengths are checked via their referenced scalar object below.
      const indirect = /\/Length\s+(\d+)\s+(\d+)\s+R\b/.exec(body.slice(0,stream.index));
      const endStream = body.lastIndexOf('endstream'); requireValid(endStream >= stream.index + stream[0].length);
      requireValid(length || indirect);
      if (length && !indirect) {
        const payloadEnd = stream.index + stream[0].length + Number(length[1]);
        requireValid(payloadEnd <= endStream && /^[\r\n]*$/.test(body.slice(payloadEnd,endStream)));
      }
      streams.push({ key:match[1]+' '+match[2],body, start:stream.index + stream[0].length, end:endStream, length, indirect });
    }
    // Delimiters outside literal strings, comments and stream payloads must balance.
    const syntax=stream ? body.slice(0,stream.index) : body; const delimiters=[]; let literal=0;
    for (let i=0;i<syntax.length;i++) {
      const char=syntax[i];
      if (literal) { if(char==='\\') i++; else if(char==='(') literal++; else if(char===')') literal--; continue; }
      if(char==='%') { while(i<syntax.length&&!/[\r\n]/.test(syntax[i])) i++; continue; }
      if(char==='(') { literal=1; continue; }
      if(char==='<'&&syntax[i+1]==='<') { delimiters.push('>>'); i++; }
      else if(char==='>'&&syntax[i+1]==='>') { requireValid(delimiters.pop()==='>>'); i++; }
      else if(char==='[') delimiters.push(']');
      else if(char===']') requireValid(delimiters.pop()===']');
    }
    requireValid(!literal&&!delimiters.length);
    objects.set(match[1] + ' ' + match[2],{ start,body }); objectPattern.lastIndex = end + 6;
  }
  requireValid(objects.size >= 2 && objects.size <= 100000);
  for (const value of streams) if(value.indirect) {
    const scalar=objects.get(value.indirect[1]+' '+value.indirect[2])?.body.trim();
    requireValid(/^\d+$/.test(scalar||''));
    const payloadEnd=value.start+Number(scalar);
    requireValid(payloadEnd<=value.end&&/^[\r\n]*$/.test(value.body.slice(payloadEnd,value.end)));
  }
  const decodedStream = value => {
    const length=value.indirect ? Number(objects.get(value.indirect[1]+' '+value.indirect[2]).body.trim()) : Number(value.length[1]);
    const data=Buffer.from(value.body.slice(value.start,value.start+length),'latin1'), dictionary=value.body.slice(0,value.start);
    requireValid(length<=bytes.length);
    if (!/\/Filter\b/.test(dictionary)) return data;
    requireValid(/\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode\s*\])/.test(dictionary));
    return expand(data,EXPANDED_LIMIT);
  };
  let expandedObjectBytes=0;
  for (const value of streams) if(/\/Type\s*\/ObjStm\b/.test(value.body)) {
    const decoded=decodedStream(value); expandedObjectBytes+=decoded.length; requireValid(expandedObjectBytes<=EXPANDED_LIMIT);
    const first=Number(/\/First\s+(\d+)\b/.exec(value.body)?.[1]),count=Number(/\/N\s+(\d+)\b/.exec(value.body)?.[1]);
    requireValid(Number.isSafeInteger(first)&&first>0&&first<=decoded.length&&Number.isSafeInteger(count)&&count>0&&count<=10000);
    const pairs=ascii(decoded,0,first).trim().split(/\s+/).map(Number); requireValid(pairs.length===2*count&&pairs.every(n=>Number.isSafeInteger(n)&&n>=0));
    for(let i=0;i<count;i++) {
      const start=first+pairs[2*i+1],end=i+1<count?first+pairs[2*i+3]:decoded.length;
      requireValid(start>=first&&start<end&&end<=decoded.length);
      const body=ascii(decoded,start,end), key=pairs[2*i]+' 0';
      const escapedNames=body.replace(/#([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
      requireValid(!/\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|Encrypt)\b/.test(escapedNames)&&!/<html(?:\s|>)|<script(?:\s|>)/i.test(body));
      objects.set(key,{ start:null,body,container:Number(value.key.split(' ')[0]),index:i });
    }
  }
  let root;
  if (text.slice(xrefOffset,xrefOffset+4) === 'xref') {
    const end = text.indexOf('trailer',xrefOffset); requireValid(end > xrefOffset);
    const entries = text.slice(xrefOffset+4,end).trim().split(/\s+/); let index = 0;
    while (index < entries.length) {
      const first = Number(entries[index++]), count = Number(entries[index++]);
      requireValid(Number.isSafeInteger(first) && first >= 0 && Number.isSafeInteger(count) && count >= 0 && count <= 100000);
      for (let i=0;i<count;i++) {
        const offset = Number(entries[index++]), generation = Number(entries[index++]), flag = entries[index++];
        requireValid(Number.isSafeInteger(offset) && Number.isSafeInteger(generation) && ['n','f'].includes(flag));
        if (flag === 'n') requireValid(objects.get((first+i) + ' ' + generation)?.start === offset);
      }
    }
    root = /\/Root\s+(\d+\s+\d+)\s+R\b/.exec(text.slice(end,tail.index))?.[1]?.replace(/\s+/g,' ');
  } else {
    const object = [...objects.values()].find(value => value.start === xrefOffset);
    requireValid(object && /\/Type\s*\/XRef\b/.test(object.body) && /\/W\s*\[\s*\d+\s+\d+\s+\d+\s*\]/.test(object.body));
    const widths=/\/W\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(object.body).slice(1).map(Number), width=widths.reduce((a,b)=>a+b,0);
    const size=Number(/\/Size\s+(\d+)\b/.exec(object.body)?.[1]);
    requireValid(width>0&&width<=24&&widths.every(n=>n<=8)&&size>0&&size<=100000);
    const indexed=/\/Index\s*\[([^\]]*)\]/.exec(object.body), indexes=indexed?indexed[1].trim().split(/\s+/).map(Number):[0,size];
    requireValid(indexes.length%2===0&&indexes.every(n=>Number.isSafeInteger(n)&&n>=0));
    const records=indexes.filter((_,i)=>i%2).reduce((sum,n)=>sum+n,0); requireValid(records<=100000);
    let decoded=decodedStream(streams.find(value=>value.key===([...objects.entries()].find(([,value])=>value===object)?.[0])));
    const predictor=Number(/\/Predictor\s+(\d+)\b/.exec(object.body)?.[1]||1);
    if(predictor!==1) {
      const columns=Number(/\/Columns\s+(\d+)\b/.exec(object.body)?.[1]||1),colors=Number(/\/Colors\s+(\d+)\b/.exec(object.body)?.[1]||1),bits=Number(/\/BitsPerComponent\s+(\d+)\b/.exec(object.body)?.[1]||8);
      requireValid(predictor>=10&&predictor<=15&&columns===width&&colors===1&&bits===8&&decoded.length===records*(width+1));
      const restored=Buffer.alloc(records*width);
      for(let row=0;row<records;row++) {
        const filter=decoded[row*(width+1)]; requireValid(filter<=4);
        for(let column=0;column<width;column++) {
          const left=column?restored[row*width+column-1]:0,up=row?restored[(row-1)*width+column]:0,corner=row&&column?restored[(row-1)*width+column-1]:0;
          let prediction=0;
          if(filter===1) prediction=left; if(filter===2) prediction=up; if(filter===3) prediction=Math.floor((left+up)/2);
          if(filter===4) { const p=left+up-corner,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-corner); prediction=a<=b&&a<=c?left:b<=c?up:corner; }
          restored[row*width+column]=(decoded[row*(width+1)+1+column]+prediction)&255;
        }
      }
      decoded=restored;
    }
    requireValid(decoded.length===records*width);
    let at=0;
    for(let section=0;section<indexes.length;section+=2) for(let i=0;i<indexes[section+1];i++) {
      const fields=widths.map((fieldWidth,index)=>{ let n=fieldWidth?0:index===0?1:0; for(let j=0;j<fieldWidth;j++) n=n*256+decoded[at++]; requireValid(Number.isSafeInteger(n)); return n; });
      requireValid([0,1,2].includes(fields[0]));
      if(fields[0]===1) requireValid(objects.get((indexes[section]+i)+' '+fields[2])?.start===fields[1]);
      if(fields[0]===2) { const target=objects.get((indexes[section]+i)+' 0'); requireValid(target?.container===fields[1]&&target?.index===fields[2]); }
    }
    root = /\/Root\s+(\d+\s+\d+)\s+R\b/.exec(object.body)?.[1]?.replace(/\s+/g,' ');
  }
  requireValid(root && /\/Type\s*\/Catalog\b/.test(objects.get(root)?.body || ''));
  const reference=(body,name)=>new RegExp('/'+name+'\\s+(\\d+\\s+\\d+)\\s+R\\b').exec(body)?.[1]?.replace(/\s+/g,' ');
  const pages=reference(objects.get(root).body,'Pages'), visited=new Set();
  const pageTree=(key,parent,depth=0)=>{
    requireValid(key&&!visited.has(key)&&depth<=32); visited.add(key);
    const body=objects.get(key)?.body; requireValid(body);
    if(parent) requireValid(reference(body,'Parent')===parent);
    if(/\/Type\s*\/Page\b/.test(body)) return 1;
    requireValid(/\/Type\s*\/Pages\b/.test(body));
    const kids=/\/Kids\s*\[([^\]]*)\]/.exec(body), count=/\/Count\s+(\d+)\b/.exec(body); requireValid(kids&&count);
    const refs=[...kids[1].matchAll(/(\d+\s+\d+)\s+R\b/g)].map(m=>m[1].replace(/\s+/g,' '));
    requireValid(!kids[1].replace(/\d+\s+\d+\s+R\b/g,'').trim());
    const total=refs.reduce((sum,child)=>sum+pageTree(child,key,depth+1),0); requireValid(total===Number(count[1])); return total;
  };
  requireValid(pageTree(pages,null)>=1);
}
function zipOffice(bytes, kind) {
  requireValid(bytes.length >= 22 && bytes.readUInt32LE(0) === 0x04034b50);
  let eocd = -1;
  for (let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i+20) === bytes.length) { eocd=i; break; }
  }
  requireValid(eocd >= 0 && bytes.readUInt16LE(eocd+4) === 0 && bytes.readUInt16LE(eocd+6) === 0);
  const count = bytes.readUInt16LE(eocd+10), centralSize = bytes.readUInt32LE(eocd+12), central = bytes.readUInt32LE(eocd+16);
  requireValid(count > 0 && count <= 1024 && count === bytes.readUInt16LE(eocd+8) && central + centralSize === eocd);
  const entries = new Map(), spans = []; let at = central, expanded = 0;
  for (let i=0;i<count;i++) {
    requireValid(at + 46 <= eocd && bytes.readUInt32LE(at) === 0x02014b50);
    const flags = bytes.readUInt16LE(at+8), method = bytes.readUInt16LE(at+10), crc = bytes.readUInt32LE(at+16),
      packed = bytes.readUInt32LE(at+20), size = bytes.readUInt32LE(at+24), nameSize = bytes.readUInt16LE(at+28),
      extraSize = bytes.readUInt16LE(at+30), commentSize = bytes.readUInt16LE(at+32), local = bytes.readUInt32LE(at+42);
    requireValid(!(flags & ~0x080e) && !(flags & 1) && [0,8].includes(method) && at+46+nameSize+extraSize+commentSize <= eocd && size <= EXPANDED_LIMIT);
    const name = new TextDecoder('utf-8',{ fatal:true }).decode(bytes.subarray(at+46,at+46+nameSize));
    requireValid(name && !entries.has(name) && !name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..') && !/[\x00-\x1f]/.test(name));
    requireValid(!/(?:vbaProject|embeddings\/)|\.(?:html?|js|exe|dll|vbs|bin)$/i.test(name));
    requireValid(local + 30 <= central && bytes.readUInt32LE(local) === 0x04034b50 && bytes.readUInt16LE(local+6) === flags && bytes.readUInt16LE(local+8) === method);
    const localNameSize = bytes.readUInt16LE(local+26), localExtra = bytes.readUInt16LE(local+28), start = local + 30 + localNameSize + localExtra;
    requireValid(bytes.subarray(local+30,local+30+localNameSize).equals(bytes.subarray(at+46,at+46+nameSize)) && start + packed <= central);
    if (!(flags & 8)) requireValid(bytes.readUInt32LE(local+14) === crc && bytes.readUInt32LE(local+18) === packed && bytes.readUInt32LE(local+22) === size);
    expanded += size; requireValid(expanded <= EXPANDED_LIMIT);
    const data = method === 0 ? bytes.subarray(start,start+packed) : expand(bytes.subarray(start,start+packed),size,true);
    requireValid(data.length === size && mediaCrc32(data) === crc);
    let end = start + packed;
    if (flags & 8) {
      requireValid(end + 12 <= central); if (bytes.readUInt32LE(end) === 0x08074b50) end += 4;
      requireValid(end+12 <= central && bytes.readUInt32LE(end) === crc && bytes.readUInt32LE(end+4) === packed && bytes.readUInt32LE(end+8) === size); end += 12;
    }
    spans.push([local,end]); entries.set(name,data); at += 46+nameSize+extraSize+commentSize;
  }
  requireValid(at === eocd); spans.sort((a,b) => a[0]-b[0]); let consumed=0;
  for (const [start,end] of spans) { requireValid(start === consumed); consumed=end; } requireValid(consumed === central);
  const xml = name => {
    const data = entries.get(name); requireValid(data);
    const value = new TextDecoder('utf-8',{ fatal:true }).decode(data); requireValid(!/<!DOCTYPE|<!ENTITY|<html\b|<script\b/i.test(value));
    const stack = []; let root = null, rootTag = null, end = 0;
    const tokens = /<\?[^]*?\?>|<!--[^]*?-->|<!\[CDATA\[[^]*?\]\]>|<\/?([A-Za-z_][\w:.-]*)(?:\s[^<>]*?)?\/?>/g; let token;
    while ((token = tokens.exec(value))) {
      const gap = value.slice(end,token.index);
      requireValid(!gap.includes('<') && (stack.length || !gap.trim())); end = tokens.lastIndex;
      if (!token[1]) continue;
      if (token[0].startsWith('</')) requireValid(stack.pop() === token[1]);
      else {
        if (!root) { root=token[1]; rootTag=token[0]; } else requireValid(stack.length > 0);
        let attributes = token[0].slice(1+token[1].length).replace(/\/?>$/,'');
        const names = new Set();
        while (attributes.trim()) {
          const attribute=/^\s+([A-Za-z_][\w:.-]*)\s*=\s*("[^"<]*"|'[^'<]*')/.exec(attributes);
          requireValid(attribute && !names.has(attribute[1])); names.add(attribute[1]); attributes=attributes.slice(attribute[0].length);
        }
        if (!token[0].endsWith('/>')) stack.push(token[1]);
      }
    }
    requireValid(root && !stack.length && !value.slice(end).trim()); return { value,root,rootTag };
  };
  const content = xml('[Content_Types].xml'); requireValid(content.root === 'Types');
  requireValid(!/macroEnabled|vbaProject|activeX/i.test(content.value));
  const main = kind === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
  requireValid(content.value.includes('/'+main) && content.value.includes(kind === 'docx' ? 'wordprocessingml.document.main+xml' : 'spreadsheetml.sheet.main+xml'));
  const document = xml(main); requireValid(document.root.split(':').at(-1) === (kind === 'docx' ? 'document' : 'workbook'));
  const prefix=document.root.includes(':') ? ':'+document.root.split(':')[0] : '';
  const namespace=new RegExp('xmlns'+prefix+'\\s*=\\s*["\\\']http://schemas\\.openxmlformats\\.org/'+(kind === 'docx' ? 'wordprocessingml' : 'spreadsheetml')+'/2006/main["\\\']');
  requireValid(namespace.test(document.rootTag));
  requireValid(xml('_rels/.rels').root === 'Relationships');
  if (kind === 'xlsx') requireValid([...entries.keys()].some(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)));
  for (const name of entries.keys()) if (name.endsWith('.xml') || name.endsWith('.rels')) xml(name);
}
function doc(bytes) {
  requireValid(starts(bytes,[208,207,17,224,161,177,26,225]) && bytes.length >= 512 && bytes.readUInt16LE(28) === 0xfffe);
  const major = bytes.readUInt16LE(26), shift = bytes.readUInt16LE(30), sector = 2 ** shift;
  requireValid((major === 3 && shift === 9) || (major === 4 && shift === 12));
  requireValid(bytes.readUInt16LE(32) === 6 && bytes.length % sector === 0 && bytes.readUInt32LE(56) === 4096);
  const sectors = bytes.length/sector-1, fatCount=bytes.readUInt32LE(44), fat=[];
  requireValid(fatCount > 0 && fatCount <= sectors);
  const sectorBytes = id => { requireValid(id < sectors); return bytes.subarray((id+1)*sector,(id+2)*sector); };
  const fatIds = new Set(), difatIds = new Set(), references=[];
  for (let i=0;i<Math.min(fatCount,109);i++) references.push(bytes.readUInt32LE(76+4*i));
  let difat=bytes.readUInt32LE(68); const difatCount=bytes.readUInt32LE(72); requireValid(difatCount<=sectors);
  for(let i=0;i<difatCount;i++) {
    requireValid(!difatIds.has(difat)); difatIds.add(difat); const data=sectorBytes(difat);
    for(let at=0;at<sector-4&&references.length<fatCount;at+=4) references.push(data.readUInt32LE(at));
    difat=data.readUInt32LE(sector-4);
  }
  requireValid(references.length===fatCount && (!difatCount || difat===0xfffffffe));
  for (const id of references) { requireValid(!fatIds.has(id)&&!difatIds.has(id)); fatIds.add(id); const data=sectorBytes(id); for (let j=0;j<sector;j+=4) fat.push(data.readUInt32LE(j)); }
  const claimed = new Set([...fatIds,...difatIds]);
  for(const id of fatIds) requireValid(fat[id]===0xfffffffd);
  for(const id of difatIds) requireValid(fat[id]===0xfffffffc);
  const chain = (id,size) => {
    const pieces=[]; const seen=new Set();
    while (id !== 0xfffffffe) {
      requireValid(id < sectors && !seen.has(id) && !claimed.has(id)); seen.add(id); claimed.add(id); pieces.push(sectorBytes(id)); id=fat[id];
    }
    const result=Buffer.concat(pieces); if (size !== undefined) requireValid(result.length >= size && result.length < size+sector);
    return size === undefined ? result : result.subarray(0,size);
  };
  const directories = chain(bytes.readUInt32LE(48)); const entries=new Map(); let root;
  for (let i=0;i+128<=directories.length;i+=128) {
    const type=directories[i+66]; if (!type) continue;
    const length=directories.readUInt16LE(i+64); requireValid([1,2,5].includes(type) && length>=2 && length<=64 && length%2===0);
    const name=directories.toString('utf16le',i,i+length-2); requireValid(!entries.has(name));
    const size=Number(directories.readBigUInt64LE(i+120)); requireValid(Number.isSafeInteger(size) && size<=bytes.length);
    const item={ type,size,start:directories.readUInt32LE(i+116) }; entries.set(name,item); if (type===5) root=item;
  }
  requireValid(root && entries.has('WordDocument') && (entries.has('0Table') || entries.has('1Table')));
  let miniFat=[],miniStream=Buffer.alloc(0);
  if (bytes.readUInt32LE(64)) { const data=chain(bytes.readUInt32LE(60),bytes.readUInt32LE(64)*sector); for (let i=0;i<data.length;i+=4) miniFat.push(data.readUInt32LE(i)); }
  if (root.size) miniStream=chain(root.start,root.size);
  const stream = item => {
    if (item.size >= 4096) return chain(item.start,item.size);
    const pieces=[], seen=new Set(); let id=item.start;
    while (id!==0xfffffffe) { requireValid(!seen.has(id) && id*64+64<=miniStream.length); seen.add(id); pieces.push(miniStream.subarray(id*64,id*64+64)); id=miniFat[id]; }
    const result=Buffer.concat(pieces); requireValid(result.length>=item.size && result.length<item.size+64); return result.subarray(0,item.size);
  };
  const word=stream(entries.get('WordDocument')); requireValid(word.length>=32 && word.readUInt16LE(0)===0xa5ec && word.readUInt16LE(2)>=0x00c1);
  requireValid(word.readUInt32LE(24)<=word.readUInt32LE(28) && word.readUInt32LE(28)<=word.length);
  stream(entries.get((word.readUInt16LE(10)&512) ? '1Table' : '0Table'));
}
function wav(bytes) {
  const chunks=riff(bytes,'WAVE'), format=chunks.find(c=>c.type==='fmt ')?.data, data=chunks.find(c=>c.type==='data')?.data;
  requireValid(format?.length>=16 && data?.length>0);
  requireValid(format.readUInt16LE(0)>0 && format.readUInt16LE(2)>0 && format.readUInt32LE(4)>0 && format.readUInt16LE(12)>0);
  requireValid(data.length%format.readUInt16LE(12)===0);
}
function ogg(bytes) {
  let at=0; const streams=new Map();
  while (at<bytes.length) {
    requireValid(at+27<=bytes.length && ascii(bytes,at,at+4)==='OggS' && bytes[at+4]===0 && !(bytes[at+5]&248));
    const segments=bytes[at+26]; requireValid(at+27+segments<=bytes.length);
    let size=0; for (let i=0;i<segments;i++) size+=bytes[at+27+i]; const end=at+27+segments+size; requireValid(end<=bytes.length);
    const page=Buffer.from(bytes.subarray(at,end)), expected=page.readUInt32LE(22); page.fill(0,22,26);
    let crc=0; for (const byte of page) { crc ^= byte<<24; for (let i=0;i<8;i++) crc=(crc<<1)^((crc&0x80000000)?0x04c11db7:0); }
    requireValid((crc>>>0)===expected);
    const serial=bytes.readUInt32LE(at+14), sequence=bytes.readUInt32LE(at+18), previous=streams.get(serial);
    if (!previous) {
      requireValid((bytes[at+5]&2) && sequence===0);
      const initial=bytes.subarray(at+27+segments,end);
      requireValid((ascii(initial,0,8)==='OpusHead' && initial.length>=19) || (initial[0]===1 && ascii(initial,1,7)==='vorbis' && initial.length>=30));
    } else requireValid(!previous.ended && sequence===previous.sequence+1);
    streams.set(serial,{ sequence,ended:Boolean(bytes[at+5]&4) }); at=end;
  }
  requireValid(streams.size>0 && [...streams.values()].every(s=>s.ended));
}
function mpeg(bytes) {
  let at=0,frames=0;
  if (ascii(bytes,0,3)==='ID3') { requireValid(bytes.length>=10 && bytes.subarray(6,10).every(n=>n<128)); const size=bytes[6]*2097152+bytes[7]*16384+bytes[8]*128+bytes[9]; at=10+size+((bytes[5]&16)?10:0); }
  while (at<bytes.length) {
    if (bytes.length-at===128 && ascii(bytes,at,at+3)==='TAG') { at=bytes.length; break; }
    requireValid(at+4<=bytes.length && bytes[at]===255 && (bytes[at+1]&224)===224);
    const version=(bytes[at+1]>>3)&3,layer=(bytes[at+1]>>1)&3,rate=(bytes[at+2]>>2)&3,bitrate=bytes[at+2]>>4,padding=(bytes[at+2]>>1)&1;
    requireValid(version!==1 && layer!==0 && rate!==3 && bitrate>0 && bitrate<15);
    const tables=version===3 ? { 3:[32,64,96,128,160,192,224,256,288,320,352,384,416,448],2:[32,48,56,64,80,96,112,128,160,192,224,256,320,384],1:[32,40,48,56,64,80,96,112,128,160,192,224,256,320] } : { 3:[32,48,56,64,80,96,112,128,144,160,176,192,224,256],2:[8,16,24,32,40,48,56,64,80,96,112,128,144,160],1:[8,16,24,32,40,48,56,64,80,96,112,128,144,160] };
    const sample=[44100,48000,32000][rate]/(version===3?1:version===2?2:4), kbps=tables[layer][bitrate-1];
    const size=layer===3 ? (Math.floor(12*kbps*1000/sample)+padding)*4 : Math.floor((layer===1&&version!==3?72:144)*kbps*1000/sample)+padding;
    requireValid(size>4 && at+size<=bytes.length); at+=size; frames++;
  }
  requireValid(frames>=2 && at===bytes.length);
}
function mp4(bytes,mime) {
  const parse=(from,to,depth=0) => {
    requireValid(depth<=12); const result=[]; let at=from;
    while (at<to) {
      requireValid(at+8<=to); let size=bytes.readUInt32BE(at),header=8; const type=ascii(bytes,at+4,at+8);
      if (size===1) { requireValid(at+16<=to); size=Number(bytes.readBigUInt64BE(at+8)); header=16; }
      requireValid(Number.isSafeInteger(size) && size>=header && at+size<=to && /^[A-Za-z0-9 ]{4}$/.test(type));
      const box={ type,start:at+header,end:at+size };
      if (['moov','trak','mdia','minf','stbl','moof','traf'].includes(type)) box.children=parse(box.start,box.end,depth+1);
      result.push(box); requireValid(result.length<=10000); at+=size;
    }
    return result;
  };
  const top=parse(0,bytes.length), type=top[0]; requireValid(type?.type==='ftyp' && type.end-type.start>=8);
  const brands=ascii(bytes,type.start,type.end); requireValid(/isom|iso[2-9]|mp4[12]|M4A |M4V |3gp[4-9]|avc1|dash/.test(brands));
  const movie=top.find(b=>b.type==='moov'), payload=top.find(b=>b.type==='mdat'); requireValid(movie && payload && payload.end>payload.start);
  const handlers=[];
  const visit=boxes => { for (const b of boxes) { if (b.type==='hdlr') { requireValid(b.end-b.start>=12); handlers.push(ascii(bytes,b.start+8,b.start+12)); } if (b.children) visit(b.children); } };
  visit(movie.children);
  requireValid(mime==='video/mp4' ? handlers.includes('vide') : handlers.includes('soun') && !handlers.includes('vide'));
}
export function assertMediaFormat(bytes,mimeType) {
  try {
    requireValid(Buffer.isBuffer(bytes) && bytes.length>0);
    if (mimeType==='text/plain') {
      const text=new TextDecoder('utf-8',{ fatal:true }).decode(bytes); requireValid(!/[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(text)); return;
    }
    // Reject recognizable active HTML embedded into a declared binary attachment.
    requireValid(!/<!doctype\s+html|<html(?:\s|>)|<script(?:\s|>)/i.test(ascii(bytes,0,bytes.length)));
    if (mimeType==='image/png') png(bytes);
    else if (mimeType==='image/jpeg') jpeg(bytes);
    else if (mimeType==='image/gif') gif(bytes);
    else if (mimeType==='image/webp') webp(bytes);
    else if (mimeType==='application/pdf') pdf(bytes);
    else if (mimeType==='application/msword') doc(bytes);
    else if (mimeType==='application/vnd.openxmlformats-officedocument.wordprocessingml.document') zipOffice(bytes,'docx');
    else if (mimeType==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') zipOffice(bytes,'xlsx');
    else if (mimeType==='audio/wav') wav(bytes);
    else if (mimeType==='audio/ogg') ogg(bytes);
    else if (mimeType==='audio/mpeg') mpeg(bytes);
    else if (['audio/mp4','video/mp4'].includes(mimeType)) mp4(bytes,mimeType);
    else requireValid(false);
  } catch {
    throw Object.assign(new Error('Dosya icerigi belirtilen medya bicimiyle uyusmuyor veya yapisi gecersiz.'), {
      code:'WHATSAPP_CRM_MEDIA_FORMAT_INVALID',statusCode:400,meta:{ transportAttempted:false },
    });
  }
}
