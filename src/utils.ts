export const mm=(n:number)=>`${Math.round(n).toLocaleString()} mm`
export const cbm=(l:number,w:number,h:number,q=1)=>l*w*h*q/1e9
export function parseCSV(text:string){ const lines=text.trim().split(/\r?\n/).filter(Boolean); if(!lines.length)return []; const parse=(s:string)=>s.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(x=>x.trim().replace(/^\"|\"$/g,'')); const head=parse(lines[0]); return lines.slice(1).map(line=>Object.fromEntries(parse(line).map((v,i)=>[head[i],v]))) }
export function download(name:string,text:string,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
