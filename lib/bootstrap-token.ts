import {env} from 'cloudflare:workers';

// The first administrator is claimed with a deployment secret, never a platform login.
// Keep this value in the Worker environment; it must not enter source or client code.
export function bootstrapTokenConfigured(){
 return typeof env.ADMIN_SETUP_TOKEN==='string'&&env.ADMIN_SETUP_TOKEN.length>=32;
}

export async function verifyBootstrapToken(value:unknown){
 if(!bootstrapTokenConfigured())throw new Error('尚未配置管理员初始化口令，请先在网站运行环境中设置 ADMIN_SETUP_TOKEN');
 if(typeof value!=='string'||value.length<32||value.length>512)return false;
 const encoder=new TextEncoder();
 const [expected,actual]=await Promise.all([
  crypto.subtle.digest('SHA-256',encoder.encode(env.ADMIN_SETUP_TOKEN)),
  crypto.subtle.digest('SHA-256',encoder.encode(value))
 ]);
 const a=new Uint8Array(expected),b=new Uint8Array(actual);
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
 return mismatch===0;
}
