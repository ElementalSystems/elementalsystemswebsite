const fs = require('fs-extra');
const path = require('path');
const showdown = require('showdown');
const mustache = require('mustache');
watchers=[];

copyAssets();
buildPagesTop('src');

function buildPagesTop(dir) {
  buildPages(dir+'/pages');
  debouncedFileWatcher(dir+'/pages',(e,fn)=>{
    if (fs.lstatSync(dir+'/pages/'+fn).isFile()) //top level change
      buildPages(dir+'/pages');
  });  
  debouncedFileWatcher(dir+'/templates',(e,fn)=>{
    if (fs.lstatSync(dir+'/templates/'+fn).isFile()) //template change
      buildPages(dir+'/pages');
  });
  debouncedFileWatcher(dir+'/assets',(e,fn)=>{
    if (fs.lstatSync(dir+'/assets/'+fn).isFile()) //asset change
      copyAssets();
  });
}

function buildPages(dir) {
  //kill old watches
  watchers.forEach(w=>{
    w.close()
  });
  watchers=[];
  console.log("Building root..."+dir)

  let base = addContext(dir, {});
  let pagelist = fs.readdirSync(dir, {
    withFileTypes: true
  }).filter(e => e.isDirectory()).map(e => e.name);
  let page=process.argv[2]; //specify which page to load (otherwise do all)
  if (page) {
    addPagePath(dir,page,base);
  }  else //all pages
    pagelist.forEach(path => addPagePath(dir, path, base));
}

function addPagePath(dir, path, base) {
  let fullB = addContext(dir + "/" + path, base);
  buildPage(fullB, path);
  var w=debouncedFileWatcher(dir + "/" + path, (e, fn) => {
      buildPage(addContext(dir + "/" + path, base), path)
    }
  );  
  watchers.push(w); //add to global watchers
}


function addContext(dir, context) {
  let base = {
    ...context
  };
  let filelist = fs.readdirSync(dir, {
    withFileTypes: true
  }).filter(e => e.isFile()).map(e => path.parse(e.name));

  //add each json file to the context
  filelist.filter(f => f.ext.toLowerCase() == '.json').forEach(f => {
    let content = fs.readFileSync(dir + '/' + f.base);
    let jsonContent = JSON.parse(content);
    base[f.name] = {
      ...base[f.name],
      ...jsonContent
    };
  });
  //add html translated content for each md file (includes class mods)
  filelist.filter(f => f.ext.toLowerCase() == '.md').forEach(f => {
    let content = fs.readFileSync(dir + '/' + f.base);
    let ref = extractMods(f.name);
    let converter = new showdown.Converter();    
    base[ref.name] = {
      content: converter.makeHtml(content.toString()),
      mods: ref.mods,
    };
  });
  //add references and base 64 url data for each image (includes class mods)
  filelist.filter(f => [".jpeg", ".jpg"].includes(f.ext.toLowerCase())).forEach(f => {
    let ref = extractMods(f.name);
    let content = fs.readFileSync(dir + '/' + f.base);
    base[ref.name] = {
      name: f.name,
      mods: ref.mods,
      dataurl: "data:image/jpeg;base64," + content.toString('base64'),
    };
  });
  //just give us a text copy for text styles (can include mods)
  filelist.filter(f => [".js", ".css", ".txt"].includes(f.ext.toLowerCase())).forEach(f => {
    let content = fs.readFileSync(dir + '/' + f.base);
    let ref = extractMods(f.name);
    base[ref.name] = {
      ext: f.ext,
      content: content.toString('ascii'),
      mods: ref.mods,
    };
  });
  return base;
}

function copyAssets() {
  console.log("Starting Asset Copy");
  fs.copySync("src/assets", "output", {
    recursive: true
  })
  console.log("Assets Copied");
}

function extractMods(fname) {
  let bits = fname.split("-");
  return {
    name: bits[0],
    mods: bits.slice(1).join(" ")
  }
}

function buildPage(base, outname) {
  //okay build the page for this one.
  try {
    let template = fs.readFileSync('src/' + base.page.template).toString();
    //console.log(base);
    //console.log(template);
    let output = mustache.render(template, base);
    //console.log(output);

    fs.writeFileSync('output/' + outname + ".html", output);
    console.log("Generated page " + outname);
  } catch (e) {
    console.log("ERROR: " + e.toString()+" while processing "+outname);
  }
}

function debouncedFileWatcher(path,func)
{
  var timer;
  w=fs.watch(path,(e,fn)=>{
    if (timer)
      clearTimeout(timer);
    timer=setTimeout(()=>{
      func(e,fn);      
    },200);
  });    
  return w;
}