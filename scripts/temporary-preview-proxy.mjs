import http from 'node:http';

// The tunnel can only forward to this project's existing local preview.
// Validate its public origin BEFORE translating it to the local dev origin.
export function createPreviewProxy({upstream = 'http://localhost:5173', getPublicOrigin, stopToken, onStop}) {
 const target = new URL(upstream);
 const localOrigin = target.origin;
 const deny = (res, status = 403) => {res.writeHead(status, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('临时验收连接尚未就绪，或请求来源不正确。');};
 const allowed = req => {
  const publicOrigin = getPublicOrigin();
  if (!publicOrigin || req.headers.host !== new URL(publicOrigin).host) return false;
  return !req.headers.origin || req.headers.origin === publicOrigin;
 };
 const headers = req => {
  const result = {...req.headers, host:target.host};
  delete result['x-forwarded-host']; delete result['x-forwarded-proto']; delete result['forwarded'];
  // The origin was checked above, including for writes and WebSockets.
  if (result.origin) result.origin = localOrigin;
  if (result.referer) result.referer = localOrigin + '/';
  return result;
 };
 const server = http.createServer((req, res) => {
  if (req.url === '/__preview_control__/stop') {
   if (req.method !== 'POST' || req.headers['x-preview-stop'] !== stopToken || req.headers.host !== `127.0.0.1:${server.address().port}`) return deny(res);
   res.writeHead(200, {'Content-Type':'application/json'});res.end('{"ok":true}');setTimeout(onStop,100);return;
  }
  if (!allowed(req)) return deny(res);
  // Never expose project-local credentials, databases or tool state.
  let pathname;
  try {pathname=decodeURIComponent(new URL(req.url,'http://preview').pathname).replaceAll('\\','/');} catch {return deny(res);}
  if (/(^|\/)\.(?:env|dev\.vars|wrangler|sites-runtime|git|venv-rapidocr)(?:[./]|$)/i.test(pathname)) return deny(res);
  const proxy = http.request(target, {method:req.method,path:req.url,headers:headers(req)}, upstreamResponse => {
   const responseHeaders = {...upstreamResponse.headers};
   if (responseHeaders.location?.startsWith(localOrigin)) responseHeaders.location = getPublicOrigin() + responseHeaders.location.slice(localOrigin.length);
   if (responseHeaders['set-cookie']) responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map(cookie => /;\s*Secure(?:;|$)/i.test(cookie)?cookie:cookie+'; Secure');
   res.writeHead(upstreamResponse.statusCode ?? 502,responseHeaders);upstreamResponse.pipe(res);
  });
  proxy.on('error',()=>{if(!res.headersSent)deny(res,502);else res.destroy();});req.on('aborted',()=>proxy.destroy());req.pipe(proxy);
 });
 server.on('upgrade',(req,socket,head)=>{
  if(!allowed(req)){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
  const proxy=http.request(target,{method:req.method,path:req.url,headers:headers(req)});
  proxy.on('upgrade',(response,upstreamSocket,upstreamHead)=>{
   socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n` + Object.entries(response.headers).flatMap(([name,value])=>Array.isArray(value)?value.map(v=>`${name}: ${v}\r\n`):[`${name}: ${value}\r\n`]).join('')+'\r\n');
   if(upstreamHead.length)socket.write(upstreamHead);if(head.length)upstreamSocket.write(head);
   socket.pipe(upstreamSocket);upstreamSocket.pipe(socket);
   socket.on('error',()=>upstreamSocket.destroy());upstreamSocket.on('error',()=>socket.destroy());socket.on('close',()=>upstreamSocket.destroy());
  });
  proxy.on('response',()=>socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));proxy.on('error',()=>socket.destroy());proxy.end();
 });
 return server;
}
