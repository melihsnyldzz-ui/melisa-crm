import {execFileSync} from 'node:child_process';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024});
const patterns=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['provider-key',/\b(?:sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{15,}/],['jwt',/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],['url-credential',/https?:\/\/[^\s/:]+:[^\s/@]+@/]];
const findings=[];let objects=0;
function scan(label,data){objects++;for(const [rule,regex]of patterns)if(regex.test(data))findings.push({label,rule});}
for(const file of git('ls-files','--cached').trim().split('\n').filter(Boolean)){
 if(/(?:^|\/)(?:\.env[^/]*|runtime|uploads)(?:\/|$)/.test(file)&&!file.endsWith('.env.example'))findings.push({label:file,rule:'forbidden-path'});
 scan('staged:'+file,git('show',':'+file));
}
let commits=[];try{commits=git('rev-list','--all').trim().split('\n').filter(Boolean)}catch{}
for(const commit of commits)for(const file of git('ls-tree','-r','--name-only',commit).trim().split('\n').filter(Boolean))scan(commit+':'+file,git('show',commit+':'+file));
console.log(JSON.stringify({objects,commits:commits.length,findings},null,2));if(findings.length)process.exitCode=1;
