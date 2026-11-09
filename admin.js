(function(){
var $=function(s){return document.querySelector(s)},S={items:[],ratings:[],messages:[],stats:{all:{},site:{}}},tab='stats',ED={},CL=['النادي الأول: السمعي البصري وصناعة المحتوى','النادي الثاني: الموسيقى والأناشيد','النادي الثالث: الفنون الدرامية'];
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function api(p,o){o=o||{};o.headers=Object.assign({'x-requested-with':'fetch'},o.headers||{});if(o.json){o.body=JSON.stringify(o.json);o.headers['content-type']='application/json'}return fetch(p,o).then(function(r){return r.json().then(function(j){return{ok:r.ok,s:r.status,j:j}})})}
var SP={
album:{t:'الألبومات',f:[['title','عنوان الألبوم','text'],['body','الوصف','area'],['pub','منشور','chk']]},
photo:{t:'الصور',f:[['title','العنوان','text'],['body','الوصف','area'],['url','الصورة (jpg/png/webp/gif)','file'],['grp','الألبوم','sel:album'],['ref','النشاط المرتبط','sel:event'],['date','التاريخ','date'],['feat','عرضها في معرض الصفحة الرئيسية','chk'],['pub','منشورة','chk']]},
video:{t:'الفيديو',f:[['title','العنوان','text'],['body','الوصف','area'],['url','رابط YouTube/Vimeo أو ارفع ملف mp4/webm','vid'],['ref','النشاط','sel:event'],['date','التاريخ','date'],['pub','منشور','chk']]},
event:{t:'الأنشطة',f:[['title','عنوان النشاط','text'],['date','التاريخ','date'],['place','المكان','text'],['body','الوصف','area'],['pub','منشور','chk']]},
announcement:{t:'الإعلانات',f:[['title','عنوان الإعلان','text'],['body','النص','area'],['date','التاريخ','date'],['pub','منشور','chk']]}};
var TABS=[['stats','نظرة عامة'],['album','الألبومات'],['photo','الصور'],['video','الفيديو'],['event','الأنشطة'],['announcement','الإعلانات'],['club','النوادي'],['comments','التعليقات والتقييمات'],['messages','الرسائل'],['settings','الإعدادات']];
function by(k){return S.items.filter(function(i){return i.kind==k})}
function nm(id){var i=S.items.filter(function(x){return x.id==id})[0];return i?i.title:''}
function load(){return api('/api/admin/data').then(function(r){if(r.s==401){$('#app').hidden=true;$('#login').hidden=false;return}$('#login').hidden=true;$('#app').hidden=false;S=r.j;draw()})}
function draw(){$('#nv').innerHTML=TABS.map(function(t){return'<button data-t="'+t[0]+'" class="'+(t[0]==tab?'on':'')+'">'+t[1]+'</button>'}).join('');var m=$('#mn');
if(tab=='stats')stats(m);else if(SP[tab])editor(tab,m);else if(tab=='club')clubs(m);else if(tab=='comments')comments(m);else if(tab=='messages')msgs(m);else settings(m)}
$('#nv').onclick=function(e){if(e.target.dataset.t){tab=e.target.dataset.t;draw()}};
$('#lf').onsubmit=function(e){e.preventDefault();api('/api/admin/login',{method:'POST',json:{code:$('#code').value}}).then(function(r){$('#code').value='';if(r.ok)load();else $('#lm').textContent=r.s==429?'محاولات كثيرة. انتظر 15 دقيقة.':'الرمز غير صحيح.'})};
$('#out').onclick=function(){api('/api/admin/logout',{method:'POST'}).then(function(){location.reload()})};
function stats(m){var a=S.stats.all,s=S.stats.site,c=function(k){return by(k).length};
m.innerHTML='<div class="stat"><div><b>'+(a.n||0)+'</b>إجمالي التقييمات</div><div><b>'+(a.n?Math.round(a.a*10)/10:'—')+'</b>المعدل العام</div><div><b>'+(s.n||0)+'</b>تقييمات المبادرة</div><div><b>'+(s.n?Math.round(s.a*10)/10:'—')+'</b>معدل المبادرة</div><div><b>'+c('photo')+'</b>صور</div><div><b>'+c('video')+'</b>فيديوهات</div><div><b>'+c('event')+'</b>أنشطة</div><div><b>'+S.messages.length+'</b>رسائل</div></div>'}
function field(f,v,k){var n=f[0],l=f[1],t=f[2],val=v?v[n]:'';if(val==null)val='';
if(t=='text')return'<label>'+l+'<input name="'+n+'" maxlength="200" value="'+esc(val)+'"></label>';
if(t=='area')return'<label>'+l+'<textarea name="'+n+'" rows="3" maxlength="4000">'+esc(val)+'</textarea></label>';
if(t=='date')return'<label>'+l+'<input type="date" name="'+n+'" value="'+esc(val)+'"></label>';
if(t=='chk')return'<label class="c"><input type="checkbox" name="'+n+'" '+((v?val:(n=='pub'?1:0))?'checked':'')+'> '+l+'</label>';
if(t.indexOf('sel:')==0)return'<label>'+l+'<select name="'+n+'"><option value="">—</option>'+by(t.slice(4)).map(function(i){return'<option value="'+i.id+'"'+(i.id==val?' selected':'')+'>'+esc(i.title)+'</option>'}).join('')+'</select></label>';
if(t=='file')return'<label>'+l+(val?' <span class="mut">(الحالية محفوظة؛ اختر ملفاً لاستبدالها)</span>':'')+'<input type="file" name="file" accept="image/*" '+(v?'':'multiple required')+'></label>';
if(t=='vid')return'<label>رابط الفيديو<input name="url" value="'+esc(val)+'" placeholder="https://www.youtube.com/watch?v=…"></label><label>أو ملف فيديو<input type="file" name="file" accept="video/mp4,video/webm"></label>'}
function up(file){return fetch('/api/admin/upload',{method:'POST',headers:{'x-requested-with':'fetch','x-filename':'f.'+(file.name.split('.').pop()||'')},body:file}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(r.status==413?'الملف كبير جداً':'نوع الملف غير مسموح');return j.url})})}
function editor(k,m){var sp=SP[k],cur=ED[k]?by(k).filter(function(i){return i.id==ED[k]})[0]:null,list=by(k);
m.innerHTML='<form class="card" id="ef"><h3 style="margin:0">'+(cur?'تعديل':'إضافة')+' — '+sp.t+'</h3>'+((k=='photo'||k=='video')?'<p class="mut" style="margin:0">تذكير بالنظام الداخلي: لا تنشر صور أو فيديوهات الأعضاء أو المشاركين دون موافقتهم، خاصة الأطفال.</p>':'')+sp.f.map(function(f){return field(f,cur,k)}).join('')+'<div><button class="p">'+(cur?'حفظ التعديل':'نشر')+'</button> '+(cur?'<button type="button" id="cx">إلغاء</button>':'')+'</div><div class="msg" id="em" role="status"></div></form><div class="card" id="ls"></div>';
var today=new Date().toISOString().slice(0,10);
$('#ls').innerHTML=list.length?list.map(function(i){var tg=k=='event'?(i.date&&i.date<today?'سابق':'قادم'):'';return'<div class="row">'+(k=='photo'?'<img src="'+esc(i.url)+'" alt="">':'')+'<div class="t"><b>'+esc(i.title||'(بلا عنوان)')+'</b> <span class="mut">'+esc(i.date||'')+' '+tg+(i.pub?'':' · مسودة')+(i.feat?' · في الرئيسية':'')+(i.grp?' · '+esc(nm(i.grp)):'')+(i.ref?' · '+esc(nm(i.ref)):'')+'</span></div>'+(k=='photo'?'<button data-a="feat" data-id="'+i.id+'">'+(i.feat?'إزالة من الرئيسية':'إلى الرئيسية')+'</button>':'')+'<button data-a="ed" data-id="'+i.id+'">تعديل</button><button class="d" data-a="del" data-id="'+i.id+'">حذف</button></div>'}).join(''):'<span class="mut">لا شيء بعد.</span>';
if($('#cx'))$('#cx').onclick=function(){ED[k]=null;draw()};
$('#ls').onclick=function(e){var a=e.target.dataset.a,id=+e.target.dataset.id;if(!a)return;
if(a=='ed'){ED[k]=id;draw();scrollTo(0,0)}
if(a=='del'&&confirm('حذف نهائي؟'))api('/api/admin/items/'+id,{method:'DELETE'}).then(load);
if(a=='feat'){var it=by(k).filter(function(x){return x.id==id})[0];it.feat=it.feat?0:1;api('/api/admin/items',{method:'POST',json:it}).then(load)}};
$('#ef').onsubmit=function(e){e.preventDefault();var f=e.target,em=$('#em'),d={kind:k},files=f.file?[].slice.call(f.file.files):[];
sp.f.forEach(function(x){var n=x[0];if(!f[n]||n=='file')return;d[n]=f[n].type=='checkbox'?(f[n].checked?1:0):f[n].value});
if(cur)d.id=cur.id;
if(k=='photo'&&!cur&&!files.length){em.textContent='اختر صورة واحدة على الأقل.';return}
if(k=='video'&&!files.length&&!d.url){em.textContent='أدخل رابطاً أو ارفع ملفاً.';return}
if(k!='album'&&k!='announcement'&&!d.title&&k!='photo'){em.textContent='العنوان مطلوب.';return}
if((k=='album'||k=='announcement'||k=='event')&&!d.title){em.textContent='العنوان مطلوب.';return}
em.textContent='جارٍ الحفظ…';
var jobs=(k=='photo'&&!cur)?files:[files[0]];
jobs.reduce(function(p,file){return p.then(function(){return(file?up(file):Promise.resolve(d.url||(cur&&cur.url)||'')).then(function(u){var x=Object.assign({},d,{url:u});if(k=='photo'&&!cur&&!x.title)x.title=file.name.replace(/\.[^.]+$/,'');return api('/api/admin/items',{method:'POST',json:x}).then(function(r){if(!r.ok)throw new Error('بيانات غير صالحة')})})})},Promise.resolve()).then(function(){ED[k]=null;return load()}).then(function(){var m2=$('#em');if(m2)m2.textContent='تم الحفظ.'}).catch(function(x){em.textContent=x.message||'تعذّر الحفظ'})}}
function clubs(m){m.innerHTML=[0,1,2].map(function(i){return'<form class="card" data-i="'+i+'"><h3 style="margin:0">'+CL[i]+'</h3><label>اللغة<select name="l"><option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option></select></label><label>الاسم<input name="n" maxlength="120"></label><label>الوصف<textarea name="d" rows="3" maxlength="600"></textarea></label><div><button class="p">حفظ</button> <button type="button" class="d" data-r="1">إعادة الافتراضي</button></div><div class="msg"></div></form>'}).join('');
function cur(i){return by('club').filter(function(c){return c.ref==i})[0]}function ex(c){try{return JSON.parse(c.extra||'{}')}catch(e){return{}}}
function fill(f){var c=cur(+f.dataset.i),o=c?ex(c)[f.l.value]||{}:{};f.n.value=o.n||'';f.d.value=o.d||''}
[].forEach.call(m.querySelectorAll('form'),function(f){fill(f);f.l.onchange=function(){fill(f)};
f.onsubmit=function(e){e.preventDefault();var i=+f.dataset.i,c=cur(i),o=c?ex(c):{};o[f.l.value]={n:f.n.value.trim(),d:f.d.value.trim()};if(!o[f.l.value].n&&!o[f.l.value].d)delete o[f.l.value];
api('/api/admin/items',{method:'POST',json:{id:c&&c.id,kind:'club',ref:i,title:'club'+i,extra:JSON.stringify(o)}}).then(function(r){f.querySelector('.msg').textContent=r.ok?'تم الحفظ.':'تعذّر الحفظ';load()})};
f.querySelector('[data-r]').onclick=function(){var c=cur(+f.dataset.i);if(c&&confirm('حذف التخصيصات؟'))api('/api/admin/items/'+c.id,{method:'DELETE'}).then(load)}})}
function comments(m){var a=S.stats.all;m.innerHTML='<div class="card"><b>'+(a.n||0)+'</b> تقييماً ظاهراً — المعدل: <b>'+(a.n?Math.round(a.a*10)/10:'—')+'</b></div><div class="card">'+(S.ratings.length?S.ratings.map(function(r){var t=r.target=='site'?'المبادرة':'نشاط: '+nm(r.target.slice(6));return'<div class="row"><div class="t"><b style="color:var(--gold)">'+'★'.repeat(r.stars)+'</b> <span class="mut">'+esc(t)+' · '+esc(r.name||'زائر')+' · '+new Date(r.created).toLocaleDateString('ar-DZ')+(r.hidden?' · مخفي':'')+'</span><br>'+esc(r.comment||'—')+'</div><button data-a="h" data-id="'+r.id+'" data-v="'+(r.hidden?0:1)+'">'+(r.hidden?'إظهار':'إخفاء')+'</button><button class="d" data-a="x" data-id="'+r.id+'">حذف</button></div>'}).join(''):'<span class="mut">لا تقييمات بعد.</span>')+'</div>';
m.onclick=function(e){var a=e.target.dataset.a,id=e.target.dataset.id;if(a=='h')api('/api/admin/rating/'+id,{method:'POST',json:{hidden:+e.target.dataset.v}}).then(load);if(a=='x'&&confirm('حذف نهائي؟'))api('/api/admin/rating/'+id,{method:'DELETE'}).then(load)}}
function msgs(m){m.innerHTML='<div class="card">'+(S.messages.length?S.messages.map(function(x){return'<div class="row"><div class="t"><b>'+esc(x.name)+'</b> <span class="mut">'+esc(x.org||'')+' · '+esc(x.topic||'')+' · '+new Date(x.created).toLocaleDateString('ar-DZ')+'</span><br>'+esc(x.body)+'<br><a style="color:var(--gold)" href="mailto:'+esc(x.email)+'">'+esc(x.email)+'</a></div><button class="d" data-id="'+x.id+'">حذف</button></div>'}).join(''):'<span class="mut">لا رسائل.</span>')+'</div>';
m.onclick=function(e){var id=e.target.dataset.id;if(id&&confirm('حذف الرسالة؟'))api('/api/admin/message/'+id,{method:'DELETE'}).then(load)}}
function settings(m){m.innerHTML='<form class="card" id="cf"><h3 style="margin:0">تغيير رمز الدخول</h3><label>الرمز الحالي<input name="c" type="password" required></label><label>الرمز الجديد (4 أحرف على الأقل؛ يُفضّل رمز أطول)<input name="n" type="password" minlength="4" required></label><label>تأكيد الرمز الجديد<input name="k" type="password" required></label><div><button class="p">تغيير الرمز</button></div><div class="msg" id="cm" role="status"></div></form>';
$('#cf').onsubmit=function(e){e.preventDefault();var f=e.target;if(f.n.value!=f.k.value){$('#cm').textContent='التأكيد غير مطابق.';return}
api('/api/admin/code',{method:'POST',json:{current:f.c.value,next:f.n.value}}).then(function(r){if(r.ok){alert('تم تغيير الرمز. سجّل الدخول من جديد.');location.reload()}else $('#cm').textContent=r.s==401?'الرمز الحالي غير صحيح.':r.s==429?'محاولات كثيرة.':'الرمز الجديد قصير.'})}}
load();
})();
