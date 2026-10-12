import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const fromNext = createRequire(require.resolve('next/package.json'));
const postcss = fromNext('postcss');
const fromFirestore = createRequire(require.resolve('@firebase/firestore'));
const grpc = fromFirestore('@grpc/grpc-js');

test('Next PostCSS preserves ordinary CSS and prevents HTML style-context breakout', () => {
  const ordinary = ':root{--brand:#15513b}@media(min-width:640px){.card{width:calc(100% - 2rem);background:linear-gradient(red,blue)}}';
  assert.equal(postcss.parse(ordinary).toResult().css, ordinary);
  const hostile = 'body{content:"</style><script>synthetic</script><style>"}';
  const rendered = postcss.parse(hostile).toResult().css;
  assert.equal(/<\/style/i.test(rendered), false);
  assert.equal(postcss.parse(rendered).first.nodes[0].prop, 'content');
});

test('Next PostCSS never reads arbitrary or traversed source-map annotations without a trusted map', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nal-postcss-'));
  const marker = 'SYNTHETIC-PRIVATE-SOURCE-NOT-FOR-CSS';
  const mapPath = join(dir, 'private.map');
  writeFileSync(mapPath, JSON.stringify({version:3,sources:['private.txt'],sourcesContent:[marker],names:[],mappings:''}));
  writeFileSync(join(dir, 'private.txt'), marker);
  try {
    for (const annotation of [mapPath, join(dir,'private.txt'), '../private.map']) {
      for (const from of [undefined, join(dir,'nested','input.css')]) {
        const result = await postcss([]).process('a{color:red}/*# sourceMappingURL='+annotation+' */', {from});
        assert.equal(JSON.stringify(result.map?.toJSON() || {}).includes(marker), false);
        assert.equal(result.css.includes(marker), false);
      }
    }
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('Firebase Node gRPC handles optional client certificates without authenticating an untrusted certificate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nal-grpc-'));
  const clients:any[] = [];
  const server = new grpc.Server();
  const openssl = (...args:string[]) => execFileSync('openssl', args, {cwd:dir,stdio:'ignore'});
  const issue = (name:string, signed:boolean) => {
    openssl('req','-new','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN='+name);
    if (signed) openssl('x509','-req','-in',name+'.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-out',name+'.crt','-days','1','-sha256');
    else openssl('req','-x509','-key',name+'.key','-in',name+'.csr','-out',name+'.crt','-days','1');
  };
  const serialize = (v:unknown) => Buffer.from(JSON.stringify(v));
  const deserialize = (v:Buffer) => JSON.parse(v.toString());
  const definitions = {
    inspect:{path:'/nal.qa.Probe/Inspect',requestStream:false,responseStream:false,requestSerialize:serialize,requestDeserialize:deserialize,responseSerialize:serialize,responseDeserialize:deserialize},
    crash:{path:'/nal.qa.Probe/Crash',requestStream:false,responseStream:false,requestSerialize:serialize,requestDeserialize:deserialize,responseSerialize:serialize,responseDeserialize:deserialize},
  };
  try {
    openssl('req','-new','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.crt','-days','1','-subj','/CN=synthetic-ca');
    issue('localhost',true); issue('trusted-client',true); issue('untrusted-client',false);
    server.addService(definitions, {
      inspect:(call:any,callback:any)=>{const context=call.getAuthContext();callback(null,{transport:context.transportSecurityType || null,certificate:!!context.sslPeerCertificate});},
      crash:()=>{throw new Error('SYNTHETIC-SENSITIVE-HANDLER-MESSAGE');},
    });
    const cert=(name:string)=>readFileSync(join(dir,name));
    // The advisory concerns the certificate-provider/xDS optional-client-cert
    // configuration; createSsl(false) does not request a peer certificate.
    // Only credential delivery is synthetic; Node TLS verification stays real.
    const provider = {
      addCaCertificateListener:(listener:any)=>queueMicrotask(()=>listener({caCertificate:cert('ca.crt')})),
      addIdentityCertificateListener:(listener:any)=>queueMicrotask(()=>listener({certificate:cert('localhost.crt'),privateKey:cert('localhost.key')})),
      removeCaCertificateListener:()=>{}, removeIdentityCertificateListener:()=>{},
    };
    const credentials=grpc.experimental.createCertificateProviderServerCredentials(provider,provider,false);
    const port = await new Promise<number>((resolve,reject)=>server.bindAsync('127.0.0.1:0',credentials,(error:Error|null,port:number)=>error?reject(error):resolve(port)));
    const Client=grpc.makeGenericClientConstructor(definitions,'SyntheticProbe');
    const clientFor=(name:string)=>{const client=new Client('127.0.0.1:'+port,grpc.credentials.createSsl(cert('ca.crt'),cert(name+'.key'),cert(name+'.crt')),{'grpc.ssl_target_name_override':'localhost'});clients.push(client);return client;};
    const invoke=(client:any,method:string)=>new Promise<any>((resolve,reject)=>client[method]({}, {deadline:new Date(Date.now()+10000)}, (error:Error|null,response:any)=>error?reject(error):resolve(response)));
    const trusted=clientFor('trusted-client');
    assert.deepEqual(await invoke(trusted,'inspect'),{transport:'ssl',certificate:true});
    assert.deepEqual(await invoke(clientFor('untrusted-client'),'inspect'),{transport:null,certificate:false});
    await assert.rejects(invoke(trusted,'crash'),(error:Error)=>!error.message.includes('SYNTHETIC-SENSITIVE-HANDLER-MESSAGE'));
  } finally {
    for (const client of clients) client.close();
    server.forceShutdown();
    rmSync(dir,{recursive:true,force:true});
  }
});
