// Deterministic native assets from the exact StockFlow V2 vector mark.
import sharp from 'sharp';
import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname);
const icon=await readFile(resolve(root,'resources/v2-icon.svg'));
const exists=async(path)=>{try{await access(path);return true;}catch{return false;}};
const png=async(path,size)=>{await mkdir(resolve(path,'..'),{recursive:true});await sharp(icon).resize(size,size).flatten({background:'#127d5c'}).png().toFile(path);};
await png(resolve(root,'resources/v2-icon.png'),1024);
await png(resolve(root,'public/icon-192.png'),192);
await png(resolve(root,'public/icon-512.png'),512);
const android=resolve(root,'android/app/src/main/res');
if(await exists(android)){
  for(const [density,scale] of [['mdpi',1],['hdpi',1.5],['xhdpi',2],['xxhdpi',3],['xxxhdpi',4]]){
    const dir=resolve(android,`mipmap-${density}`);
    await png(resolve(dir,'ic_launcher.png'),48*scale);
    await png(resolve(dir,'ic_launcher_round.png'),48*scale);
    // 108dp adaptive foreground canvas: keep the mark in the safe inner zone.
    const inner=await sharp(icon).resize(66*scale,66*scale).png().toBuffer();
    await sharp({create:{width:108*scale,height:108*scale,channels:4,background:'#127d5c'}}).composite([{input:inner,gravity:'centre'}]).png().toFile(resolve(dir,'ic_launcher_foreground.png'));
  }
  await writeFile(resolve(android,'values/ic_launcher_background.xml'),'<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#127d5c</color></resources>\n');
  // Replace each generated splash bitmap while retaining its template size.
  for(const dir of await readdir(android)){
    const path=resolve(android,dir,'splash.png');
    if(!dir.startsWith('drawable')||!await exists(path))continue;
    const {width=1920,height=1920}=await sharp(path).metadata();
    const mark=await sharp(icon).resize(Math.round(Math.min(width,height)*0.22)).png().toBuffer();
    const data=await sharp({create:{width,height,channels:3,background:'#127d5c'}}).composite([{input:mark,gravity:'centre'}]).png().toBuffer();
    await writeFile(path,data);
  }
}
const ios=resolve(root,'ios/App/App/Assets.xcassets');
if(await exists(ios)){
  const config=JSON.parse(await readFile(resolve(ios,'AppIcon.appiconset/Contents.json'),'utf8'));
  for(const image of config.images)if(image.filename)await png(resolve(ios,'AppIcon.appiconset',image.filename),Math.round(Number(image.size.split('x')[0])*Number((image.scale??'1x').replace('x',''))));
  const splash=JSON.parse(await readFile(resolve(ios,'Splash.imageset/Contents.json'),'utf8'));
  const mark=await sharp(icon).resize(512).png().toBuffer();
  for(const image of splash.images)if(image.filename)await sharp({create:{width:2732,height:2732,channels:3,background:'#127d5c'}}).composite([{input:mark,gravity:'centre'}]).png().toFile(resolve(ios,'Splash.imageset',image.filename));
}
console.log('Prepared StockFlow V2 web icons, adaptive Android icons and native splash/AppIcon assets.');
