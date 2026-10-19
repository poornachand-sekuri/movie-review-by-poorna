import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/admin/social-bulk-zip.js','utf8');
const output={};
vm.runInNewContext(source,{
  window:output,TextEncoder,Uint8Array,Uint32Array,DataView,Blob,Date,Math,Error
},{filename:'social-bulk-zip.js'});

function extractStoredFiles(bytes){
  const files=new Map(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let pos=0;
  while(pos+30<=bytes.length && view.getUint32(pos,true)===0x04034b50){
    const method=view.getUint16(pos+8,true);
    assert.equal(method,0,'Precompressed PNG bytes are archived losslessly (ZIP STORED).');
    const size=view.getUint32(pos+18,true);
    const nameLength=view.getUint16(pos+26,true);
    const extraLength=view.getUint16(pos+28,true);
    const name=new TextDecoder().decode(bytes.slice(pos+30,pos+30+nameLength));
    const start=pos+30+nameLength+extraLength;
    files.set(name,bytes.slice(start,start+size));
    pos=start+size;
  }
  assert.equal(view.getUint32(pos,true),0x02014b50,'Central directory is present.');
  assert.equal(view.getUint32(bytes.length-22,true),0x06054b50,'ZIP end-of-directory record is present.');
  assert.equal(view.getUint16(bytes.length-22+10,true),files.size,'File count must be correct.');
  return files;
}

test('Browser ZIP module creates a valid multi-file archive with UTF-8 titles and unmodified PNG bytes',async()=>{
  const sink=output.MovieReviewBulkZip.memorySink();
  const zip=new output.MovieReviewBulkZip.ZipWriter(sink);
  const binary=new Uint8Array([137,80,78,71,0,255,0,14,10]);
  await zip.add('movies/jyo-achyutananda/images/post.png',binary);
  await zip.add('movies/జ్యో/captions/instagram-post.txt','MY POV: తెలుగులో 🎬');
  await zip.add('manifest.csv','"Movie","Images"\r\n"JYO",4\r\n');
  await zip.close();
  const bytes=new Uint8Array(await sink.blob().arrayBuffer());
  const files=extractStoredFiles(bytes);
  assert.deepEqual([...files.keys()],[
    'movies/jyo-achyutananda/images/post.png',
    'movies/జ్యో/captions/instagram-post.txt','manifest.csv'
  ]);
  assert.deepEqual([...files.get('movies/jyo-achyutananda/images/post.png')],[...binary]);
  assert.equal(new TextDecoder().decode(files.get('movies/జ్యో/captions/instagram-post.txt')),'MY POV: తెలుగులో 🎬');
});

test('ZIP writer rejects zip-slip paths and double close is safe',async()=>{
  const sink=output.MovieReviewBulkZip.memorySink();
  const zip=new output.MovieReviewBulkZip.ZipWriter(sink);
  await assert.rejects(zip.add('../secret.txt','no'),/Invalid ZIP path/);
  await assert.rejects(zip.add('/absolute.txt','no'),/Invalid ZIP path/);
  await zip.add('START_HERE.txt','Safe and read-only');
  await zip.close();await zip.close();
  await assert.rejects(zip.add('later.txt','no'),/already closed/);
  assert.equal(extractStoredFiles(new Uint8Array(await sink.blob().arrayBuffer())).size,1);
});

test('ZIP writer streams entries rather than holding every image in a separate archive buffer',async()=>{
  let written=0,closed=0;
  const writer=new output.MovieReviewBulkZip.ZipWriter({
    async write(bytes){written+=bytes.byteLength;},
    async close(){closed++;}
  });
  await writer.add('post.png',new Uint8Array(2048));
  await writer.add('story.png',new Uint8Array(1024));
  await writer.close();
  assert.ok(written>3072,'Includes source image bytes and ZIP records');
  assert.equal(closed,1);
});
