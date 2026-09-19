const textEncoder=new TextEncoder()
const textDecoder=new TextDecoder()
const EOCD=0x06054b50
const CEN=0x02014b50
const LOC=0x04034b50

type ZipEntry={name:string;method:number;crc:number;compressed:Uint8Array;uncompressedSize:number;flags:number}
const u16=(v:DataView,o:number)=>v.getUint16(o,true)
const u32=(v:DataView,o:number)=>v.getUint32(o,true)
const put16=(a:number[],v:number)=>a.push(v&255,(v>>>8)&255)
const put32=(a:number[],v:number)=>a.push(v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255)
function crc32(data:Uint8Array){let c=0xffffffff;for(const b of data){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
function concat(chunks:Uint8Array[]){const n=chunks.reduce((s,x)=>s+x.length,0),out=new Uint8Array(n);let p=0;for(const x of chunks){out.set(x,p);p+=x.length}return out}
function findEocd(bytes:Uint8Array){for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(new DataView(bytes.buffer,bytes.byteOffset+i,4).getUint32(0,true)===EOCD)return i;throw new Error('Invalid DOCX template ZIP')}
export function parseStoredZip(bytes:Uint8Array):ZipEntry[]{const e=findEocd(bytes),v=new DataView(bytes.buffer,bytes.byteOffset+e),count=u16(v,10),centralSize=u32(v,12),centralOffset=u32(v,16),cd=new DataView(bytes.buffer,bytes.byteOffset+centralOffset,centralSize),out:ZipEntry[]=[];let p=0;for(let i=0;i<count;i++){if(u32(cd,p)!==CEN)throw new Error('Invalid central directory');const flags=u16(cd,p+8),method=u16(cd,p+10),crc=u32(cd,p+16),cs=u32(cd,p+20),us=u32(cd,p+24),nl=u16(cd,p+28),el=u16(cd,p+30),cl=u16(cd,p+32),local=u32(cd,p+42),name=textDecoder.decode(bytes.subarray(centralOffset+p+46,centralOffset+p+46+nl)),lv=new DataView(bytes.buffer,bytes.byteOffset+local),ln=u16(lv,26),le=u16(lv,28),dataStart=local+30+ln+le;out.push({name,method,crc,compressed:bytes.slice(dataStart,dataStart+cs),uncompressedSize:us,flags});p+=46+nl+el+cl}return out}
function localHeader(e:ZipEntry){const name=textEncoder.encode(e.name),a:number[]=[];put32(a,LOC);put16(a,20);put16(a,0);put16(a,e.method);put16(a,0);put16(a,0);put32(a,e.crc);put32(a,e.compressed.length);put32(a,e.uncompressedSize);put16(a,name.length);put16(a,0);return{bytes:new Uint8Array(a),name}}
function centralHeader(e:ZipEntry,offset:number){const name=textEncoder.encode(e.name),a:number[]=[];put32(a,CEN);put16(a,20);put16(a,20);put16(a,0);put16(a,e.method);put16(a,0);put16(a,0);put32(a,e.crc);put32(a,e.compressed.length);put32(a,e.uncompressedSize);put16(a,name.length);put16(a,0);put16(a,0);put16(a,0);put16(a,0);put32(a,0);put32(a,offset);return{bytes:new Uint8Array(a),name}}
export async function extractZipEntry(bytes:Uint8Array,name:string){const entry=parseStoredZip(bytes).find(e=>e.name===name);if(!entry)throw new Error(`ZIP entry not found: ${name}`);if(entry.method===0)return entry.compressed;if(entry.method!==8)throw new Error(`Unsupported ZIP compression: ${entry.method}`);const buffer=new ArrayBuffer(entry.compressed.byteLength);new Uint8Array(buffer).set(entry.compressed);const stream=new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new Uint8Array(await new Response(stream).arrayBuffer())}
export function buildZip(entries:ZipEntry[]){const locals:Uint8Array[]=[];const central:Uint8Array[]=[];let offset=0;for(const e of entries){const h=localHeader(e);locals.push(h.bytes,h.name,e.compressed);offset+=h.bytes.length+h.name.length+e.compressed.length}const centralStart=offset;let localOffset=0;for(const e of entries){const h=centralHeader(e,localOffset);central.push(h.bytes,h.name);localOffset+=30+textEncoder.encode(e.name).length+e.compressed.length}const c=concat(central),l=concat(locals),a:number[]=[];put32(a,EOCD);put16(a,0);put16(a,0);put16(a,entries.length);put16(a,entries.length);put32(a,c.length);put32(a,centralStart);put16(a,0);return concat([l,c,new Uint8Array(a)])}
export function createDocxFromTemplate(template:ArrayBuffer,xmlText:string,imagePng:Uint8Array){const original=parseStoredZip(new Uint8Array(template)),xml=textEncoder.encode(xmlText),replacements=new Map([['word/document.xml',xml],['word/media/image1.png',imagePng]]);return buildZip(original.map(e=>{const data=replacements.get(e.name);return data?{name:e.name,method:0,crc:crc32(data),compressed:data,uncompressedSize:data.length,flags:0}:e}))}

function drawingXml(rId:string,id:number,name:string,cx:number,cy:number){return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`}

function cellText(cell:Element,w:string){return Array.from(cell.getElementsByTagNameNS(w,'t')).map(x=>x.textContent||'').join('')}
function setCell(cell:Element,text:string,w:string){const ts=Array.from(cell.getElementsByTagNameNS(w,'t'));if(ts.length){ts[0].textContent=text;for(let i=1;i<ts.length;i++)ts[i].textContent=''}else{const p=cell.getElementsByTagNameNS(w,'p')[0];if(p){const r=cell.ownerDocument!.createElementNS(w,'w:r'),t=cell.ownerDocument!.createElementNS(w,'w:t');t.textContent=text;r.appendChild(t);p.appendChild(r)}}}

export async function createDocxWithPlanImages(template:ArrayBuffer,xmlText:string,topPng:Uint8Array,sideFrontPng:Uint8Array){
  const bytes=new Uint8Array(template),entries=parseStoredZip(bytes),parser=new DOMParser(),doc=parser.parseFromString(xmlText,'application/xml')
  const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main',r='http://schemas.openxmlformats.org/officeDocument/2006/relationships',tables=Array.from(doc.getElementsByTagNameNS(w,'tbl'))
  const cargoTable=tables[0],plan=tables[1]
  if(!cargoTable||!plan)throw new Error('Plan tables not found')

  const cargoRows=Array.from(cargoTable.getElementsByTagNameNS(w,'tr'))
  const dataRow=cargoRows[2]
  if(dataRow){
    const cells=Array.from(dataRow.getElementsByTagNameNS(w,'tc'))
    if(cells.length>=7){
      const names=cellText(cells[1],w).split('；').map(x=>x.trim()).filter(Boolean)
      const weights=cellText(cells[3],w).split('；').map(x=>x.trim()).filter(Boolean)
      const dims=cellText(cells[5],w).split('；').map(x=>x.trim()).filter(Boolean)
      const types=cellText(cells[6],w).split('；').map(x=>x.trim()).filter(Boolean)
      const rowsToCreate=names.length?names.map((name,i)=>{
        const m=name.match(/^(.*?)\s*[×xX]\s*(\d+)$/)
        const count=m?m[2]:'1',displayName=m?m[1].trim():name
        return {name:displayName,count,weight:weights[i]||weights[0]||'-',dimension:dims[i]||dims[0]||'-',type:types[i]||types[0]||'-'}
      }):[]
      const templateRow=dataRow.cloneNode(true) as Element
      for(const row of cargoRows.slice(3)) row.parentElement?.removeChild(row)
      if(rowsToCreate.length){
        for(const row of rowsToCreate){
          const clone=templateRow.cloneNode(true) as Element
          const cc=Array.from(clone.getElementsByTagNameNS(w,'tc'))
          if(cc.length>=7){setCell(cc[1],row.name,w);setCell(cc[2],row.count,w);setCell(cc[3],row.weight,w);const total=(Number(row.weight)||0)*(Number(row.count)||0);setCell(cc[4],Number.isFinite(total)?total.toFixed(1):'-',w);setCell(cc[5],row.dimension,w);setCell(cc[6],row.type,w)}
          cargoTable.appendChild(clone)
        }
        dataRow.parentElement?.removeChild(dataRow)
      }else{
        for(const row of cargoRows.slice(3)) row.parentElement?.removeChild(row)
      }
    }
  }

  for(const blip of Array.from(doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main','blip'))){if(blip.getAttributeNS(r,'embed')==='rId4'){let node:Element|null=blip;while(node&&node.localName!=='p')node=node.parentElement;node?.parentElement?.removeChild(node)}}
  const rows=Array.from(plan.getElementsByTagNameNS(w,'tr'))
  const inject=(rowIndex:number,rId:string,id:number,name:string,cx:number,cy:number)=>{const cells=Array.from(rows[rowIndex].getElementsByTagNameNS(w,'tc')),cell=cells[1];if(!cell)throw new Error(`Plan image cell ${rowIndex} not found`);while(cell.firstChild)cell.removeChild(cell.firstChild);const holder=parser.parseFromString(drawingXml(rId,id,name,cx,cy),'application/xml').documentElement;cell.appendChild(doc.importNode(holder,true))}
  inject(0,'rId8',8,'俯视示意图',5200000,2184000)
  inject(1,'rId9',9,'侧视正视示意图',5200000,2236000)
  const outXml=new XMLSerializer().serializeToString(doc),relEntry=entries.find(e=>e.name==='word/_rels/document.xml.rels');if(!relEntry)throw new Error('Template relationships not found')
  const relText=textDecoder.decode(await extractZipEntry(bytes,'word/_rels/document.xml.rels')),relOut=relText.replace('</Relationships>','<Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.png"/><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image3.png"/></Relationships>')
  const finalEntries:ZipEntry[]=[]
  for(const e of entries){if(e.name==='word/document.xml'){const data=textEncoder.encode(outXml);finalEntries.push({name:e.name,method:0,crc:crc32(data),compressed:data,uncompressedSize:data.length,flags:0})}else if(e.name==='word/_rels/document.xml.rels'){const data=textEncoder.encode(relOut);finalEntries.push({name:e.name,method:0,crc:crc32(data),compressed:data,uncompressedSize:data.length,flags:0})}else finalEntries.push(e)}
  finalEntries.push({name:'word/media/image2.png',method:0,crc:crc32(topPng),compressed:topPng,uncompressedSize:topPng.length,flags:0})
  finalEntries.push({name:'word/media/image3.png',method:0,crc:crc32(sideFrontPng),compressed:sideFrontPng,uncompressedSize:sideFrontPng.length,flags:0})
  return buildZip(finalEntries)
}
