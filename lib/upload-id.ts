// LAN HTTP pages do not expose crypto.randomUUID, but getRandomValues is available.
export function createUploadId(source:Pick<Crypto,'getRandomValues'> & Partial<Pick<Crypto,'randomUUID'>>=crypto):string{
 if(typeof source.randomUUID==='function')return source.randomUUID();
 const bytes=source.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
