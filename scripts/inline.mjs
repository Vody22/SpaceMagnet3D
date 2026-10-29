// Produces dist-single/index.html with JS and CSS inlined (one self-contained file),
// handy for sharing a playable preview. Run after `vite build`.
import fs from 'fs';
import path from 'path';

const dist = 'dist';
const read = (f) => fs.readFileSync(path.join(dist, f), 'utf8');
let html = read('index.html');
const scripts = [];
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g, (_, f) => `<style>${read(f)}</style>`);
html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_, f) => {
  scripts.push(read(f).replace(/<\/script/g, '<\\/script'));
  return '';
});
// Module scripts are deferred, so run them after the HUD markup exists.
html = html.replace('</body>', () => `${scripts.map((js) => `<script type="module">${js}</script>`).join('\n')}\n</body>`);
fs.mkdirSync('dist-single', { recursive: true });
fs.writeFileSync('dist-single/index.html', html);
console.log(`dist-single/index.html ${(html.length / 1024).toFixed(0)} KB`);

// Fragment variant for hosts that supply their own <html>/<head>/<body> wrapper.
const title = html.match(/<title>.*?<\/title>/)[0];
const styles = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const fragment = `${title}\n<style>:root{color-scheme:dark}html,body{background:#05060f}</style>\n${styles}\n${body}`;
fs.writeFileSync('dist-single/fragment.html', fragment);
console.log(`dist-single/fragment.html ${(fragment.length / 1024).toFixed(0)} KB`);
