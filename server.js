import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {research} from './research.js';
const assets={'/':['public/index.html','text/html'],'/app.js':['public/app.js','text/javascript'],'/style.css':['public/style.css','text/css']};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
 try {
  if(req.url==='/api/brief'&&req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1500000){res.writeHead(413);res.end('Request too large');return;}}const result=await research(JSON.parse(body));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));return;}
  if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"status":"ok"}');return;}
  if(req.method==='GET'&&assets[req.url]){const [file,type]=assets[req.url];res.writeHead(200,{'Content-Type':type});res.end(await readFile(new URL(file,import.meta.url)));return;}
  res.writeHead(404);res.end('Not found');
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Account Lens listening on port '+(process.env.PORT||3000)));
