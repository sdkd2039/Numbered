// دوال HTTP مشتركة بين وحدات Worker.

function json(data, status=200) {
  return new Response(JSON.stringify(data), {status, headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}

function validURL(value) {
  try { const u=new URL(value); return ["https:","http:"].includes(u.protocol)&&!u.username&&!u.password; }
  catch { return false; }
}

function htmlResponse(html) {
  return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","X-Frame-Options":"DENY","Content-Security-Policy":"default-src 'self'; img-src 'self' https: data: blob:; media-src 'self' blob:; font-src https://file.garden; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; worker-src 'self'; manifest-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
