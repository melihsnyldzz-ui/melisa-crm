import {execFileSync,spawnSync} from 'node:child_process';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024});
const patterns=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['provider-key',/\b(?:sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{15,}/],['jwt',/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],['url-credential',/https?:\/\/[^\s/:]+:[^\s/@]+@/]];
const findings=[];let objects=0;
function scan(label,data){objects++;for(const [rule,regex]of patterns)if(regex.test(data))findings.push({label,rule});
 if(!/(?:test|fixture|docs)[/\\.]|tests\//i.test(label))for(const m of data.matchAll(/\b(?:password|jwtSecret|apiAccessToken|apiKey|clientSecret|accessToken|chatwootToken)\s*[:=]\s*(['"])([^'"\r\n]+)\1/g))if(!/^(?:placeholder|example|synthetic|test|dummy)/i.test(m[2]))findings.push({label,rule:'nonfixture-credential-literal'});
}
const blobs=new Map();
function add(id,label){if(!blobs.has(id))blobs.set(id,[]);blobs.get(id).push(label);const file=label.slice(label.indexOf(':')+1);if(/(?:^|\/)(?:\.env[^/]*|runtime|uploads)(?:\/|$)/.test(file)&&!file.endsWith('.env.example'))findings.push({label,rule:'forbidden-path'});}
for(const line of git('ls-files','--stage').trim().split('\n').filter(Boolean)){const m=line.match(/^\d+ ([a-f0-9]+) 0\t(.+)$/);if(m)add(m[1],'staged:'+m[2]);}
let commits=[];try{commits=git('rev-list','--all').trim().split('\n').filter(Boolean)}catch{}
if(commits.length)for(const line of git('rev-list','--objects','--all').trim().split('\n')){const id=line.slice(0,40),file=line.slice(41);add(id,'history:'+file);}
const result=spawnSync('git',['cat-file','--batch'],{input:[...blobs.keys()].join('\n')+'\n',maxBuffer:64*1024*1024});if(result.status!==0)throw Error('Blob scan read failed');
let offset=0,uniqueBlobs=0;while(offset<result.stdout.length){const end=result.stdout.indexOf(10,offset);const [id,type,size]=result.stdout.subarray(offset,end).toString().split(' ');offset=end+1;const data=result.stdout.subarray(offset,offset+Number(size));offset+=Number(size)+1;if(type==='blob'){uniqueBlobs++;for(const label of blobs.get(id))scan(label,data.toString());}}
console.log(JSON.stringify({objects,uniqueBlobs,commits:commits.length,findings},null,2));if(findings.length)process.exitCode=1;
