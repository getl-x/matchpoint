try{
 const port=process.env.PORT||'4177';const response=await fetch('http://127.0.0.1:'+port+'/healthz',{signal:AbortSignal.timeout(3000)});
 if(!response.ok||(await response.json()).status!=='ok')process.exit(1);
}catch{process.exit(1);}
