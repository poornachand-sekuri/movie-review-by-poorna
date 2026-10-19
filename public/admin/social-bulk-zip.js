/* Minimal uncompressed ZIP writer for large, already-compressed social PNGs.
 * Native File System Access streams to disk; older browsers use small Blob batches.
 * No CDN script, third-party service or extra Cloudflare API calls for packaging. */
(()=>{
  'use strict';
  const encoder=new TextEncoder();
  const TABLE=new Uint32Array(256);
  for(let i=0;i<256;i++){
    let c=i;
    for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
    TABLE[i]=c>>>0;
  }
  function crc32(bytes){
    let c=0xffffffff;
    for(let i=0;i<bytes.length;i++)c=TABLE[(c^bytes[i])&255]^(c>>>8);
    return (c^0xffffffff)>>>0;
  }
  const two=(v)=>Math.max(0,Math.min(65535,v));
  function dateTime(date){
    const year=Math.max(1980,date.getFullYear());
    return {date:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate(),
      time:(date.getHours()<<11)|(date.getMinutes()<<5)|Math.floor(date.getSeconds()/2)};
  }
  const validName=name=>typeof name==='string'&&name.length>0&&
    !name.startsWith('/')&&!name.includes('\\')&&
    !name.split('/').some(part=>part==='..'||part==='.');
  class ZipWriter {
    constructor(sink){
      if(!sink||typeof sink.write!=='function'||typeof sink.close!=='function')throw Error('Writable ZIP sink required.');
      this.sink=sink;this.entries=[];this.offset=0;this.closed=false;
    }
    async write(bytes){
      if(this.offset+bytes.byteLength>0xffffffff)throw Error('ZIP reached the 4 GB file-size limit; export smaller batches.');
      await this.sink.write(bytes);
      this.offset+=bytes.byteLength;
    }
    async add(name,value){
      if(this.closed)throw Error('Archive already closed.');
      if(!validName(name))throw Error('Invalid ZIP path.');
      if(this.entries.length>=65535)throw Error('Too many files in ZIP.');
      const path=encoder.encode(name);
      if(path.length>65535)throw Error('ZIP path is too long.');
      const bytes=typeof value==='string'?encoder.encode(value)
        :value instanceof Uint8Array?value:new Uint8Array(await value.arrayBuffer());
      if(bytes.byteLength>0xffffffff)throw Error('Individual file exceeds ZIP limit.');
      const size=bytes.byteLength,crc=crc32(bytes),at=this.offset,when=dateTime(new Date());
      const local=new Uint8Array(30+path.length),v=new DataView(local.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);
      v.setUint16(6,0x0800,true);v.setUint16(8,0,true);
      v.setUint16(10,two(when.time),true);v.setUint16(12,two(when.date),true);
      v.setUint32(14,crc,true);v.setUint32(18,size,true);v.setUint32(22,size,true);
      v.setUint16(26,path.length,true);v.setUint16(28,0,true);
      local.set(path,30);
      await this.write(local);await this.write(bytes);
      this.entries.push({path,crc,size,at,when});
    }
    async close(){
      if(this.closed)return;
      const start=this.offset;
      for(const entry of this.entries){
        const rec=new Uint8Array(46+entry.path.length),v=new DataView(rec.buffer);
        v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);
        v.setUint16(8,0x0800,true);v.setUint16(10,0,true);
        v.setUint16(12,two(entry.when.time),true);v.setUint16(14,two(entry.when.date),true);
        v.setUint32(16,entry.crc,true);v.setUint32(20,entry.size,true);v.setUint32(24,entry.size,true);
        v.setUint16(28,entry.path.length,true);v.setUint16(30,0,true);v.setUint16(32,0,true);
        v.setUint16(34,0,true);v.setUint16(36,0,true);v.setUint32(38,0,true);
        v.setUint32(42,entry.at,true);rec.set(entry.path,46);
        await this.write(rec);
      }
      const size=this.offset-start,eocd=new Uint8Array(22),v=new DataView(eocd.buffer);
      v.setUint32(0,0x06054b50,true);v.setUint16(4,0,true);v.setUint16(6,0,true);
      v.setUint16(8,this.entries.length,true);v.setUint16(10,this.entries.length,true);
      v.setUint32(12,size,true);v.setUint32(16,start,true);v.setUint16(20,0,true);
      await this.write(eocd);
      await this.sink.close();
      this.closed=true;
    }
  }
  function memorySink(){
    const chunks=[];
    return {chunks,async write(bytes){chunks.push(bytes);},async close(){},
      blob(){return new Blob(chunks,{type:'application/zip'});}};
  }
  window.MovieReviewBulkZip={ZipWriter,memorySink};
})();
