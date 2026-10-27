import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import * as canvas from './canvas.js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import NotebookCanvas from './NotebookCanvas.jsx';

it('renders AI highlighting as translucent filled rectangles',()=>{
  const html=renderToStaticMarkup(React.createElement(NotebookCanvas,{page:{id:'highlight',paper:'blank',elements:[{id:'h',type:'rect',x:10,y:10,width:80,height:20,color:'#ffda55',highlight:true,ai:true}]}}));
  expect(html).toContain('fill="#ffda55"');
  expect(html).toContain('fill-opacity="0.18"');
});

it('renders paper, raster background, separate student and AI layers and multiline handwriting', () => {
  const html = renderToStaticMarkup(React.createElement(NotebookCanvas, {page:{id:'p',paper:'grid',background:'data:image/png;base64,abc',elements:[{id:'s',type:'stroke',points:[[10,10,.5],[20,20,1]],color:'#222',width:3},{id:'a',type:'text',x:40,y:40,text:'hello\nworld',size:24,color:'#7047eb',ai:true},{id:'r',type:'rect',x:20,y:20,width:50,height:40,color:'#111'},{id:'e',type:'ellipse',x:80,y:20,width:50,height:40,color:'#111'},{id:'ar',type:'arrow',x:10,y:100,width:50,height:40,color:'#111'}]},tool:'pen'}));
  expect(html).toContain('viewBox="0 0 800 1100"');
  expect(html).toContain('data-layer="student"');
  expect(html).toContain('data-layer="ai"');
  expect(html).toContain('data-paper="grid"');
  expect(html).toContain('data:image/png;base64,abc');
  expect(html).toContain('Caveat');
  expect(html).toContain('>world</tspan>');
  expect(html).toContain('<ellipse');
  expect(html).toContain('data-element-id="ar"');
});

describe('browser canvas interactions', () => {
  let server,browser,p;
  beforeAll(async () => {
    server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0}});
    await server.listen();
    browser=await chromium.launch({headless:true});
    p=await browser.newPage({viewport:{width:1100,height:1300}});
    await p.goto(server.resolvedUrls.local[0]);
    await p.evaluate(async () => {
      const load=new Function('url','return import(url)');
      const {default:React}=await load('/node_modules/.vite/deps/react.js');
      const {default:{createRoot}}=await load('/node_modules/.vite/deps/react-dom_client.js');
      const {default:Canvas}=await load('/src/NotebookCanvas.jsx');
      document.body.innerHTML='<div id="canvas-test"></div>';
      document.body.style.margin='0';
      window.changes=[];window.selection=null;window.canvasRef=React.createRef();
      function Harness(){
        const [page,setPage]=React.useState({id:'test',paper:'grid',elements:[]});
        const [tool,setTool]=React.useState('pen');
        window.setTool=setTool;window.setCanvasPage=setPage;
        React.useEffect(()=>{window.canvasState={pageId:page.id,tool};},[page,tool]);
        return React.createElement(Canvas,{ref:window.canvasRef,page,tool,onChange:elements=>{window.changes.push(elements);setPage(p=>({...p,elements}));},onSelection:s=>window.selection=s,onAskAI:s=>window.asked=s});
      }
      createRoot(document.getElementById('canvas-test')).render(React.createElement(Harness));
    });
    await p.waitForSelector('svg.notebook-svg');
  },30000);
  afterAll(async()=>{await browser?.close();await server?.close();});
  it('commits one smooth stroke after pointerup, not on every pointermove',async()=>{
    await p.mouse.move(100,100);await p.mouse.down();await p.mouse.move(200,130,{steps:8});
    expect(await p.evaluate(()=>window.changes.length)).toBe(0);
    await p.mouse.up();
    expect(await p.evaluate(()=>window.changes.length)).toBe(1);
    expect(await p.evaluate(()=>window.changes[0][0].points.length)).toBeGreaterThan(2);
    expect(await p.locator('[data-element-id]').count()).toBe(1);
  });
  it('creates shapes and inline multiline text with one commit each',async()=>{
    await p.evaluate(()=>{window.changes=[];window.setCanvasPage({id:'shapes',paper:'lined',elements:[]});window.setTool('rect');});
    await p.waitForFunction(()=>window.canvasState?.pageId === 'shapes' && window.canvasState.tool === 'rect');
    await p.mouse.move(20,20);await p.mouse.down();await p.mouse.move(80,70);await p.mouse.up();
    expect(await p.evaluate(()=>window.changes[0][0])).toMatchObject({type:'rect',x:20,y:20,width:60,height:50});
    for(const tool of ['ellipse','arrow']){
      await p.evaluate(t=>window.setTool(t),tool);
      await p.waitForFunction(t=>window.canvasState.tool === t,tool);
      await p.mouse.move(100,100);await p.mouse.down();await p.mouse.move(160,160);await p.mouse.up();
    }
    await p.evaluate(()=>window.setTool('text'));
    await p.waitForFunction(()=>window.canvasState.tool === 'text');
    await p.mouse.click(200,200);
    await p.locator('textarea').fill('one\ntwo');
    await p.locator('textarea').press('Control+Enter');
    expect(await p.evaluate(()=>window.changes.length)).toBe(4);
    expect(await p.evaluate(()=>window.changes.at(-1).at(-1))).toMatchObject({type:'text',text:'one\ntwo',x:200,y:200});
  });
  it('lassos, moves, resizes, asks AI and deletes a selection without stealing text input keys',async()=>{
    await p.evaluate(()=>{window.changes=[];window.setCanvasPage({id:'selection',paper:'blank',elements:[{id:'r',type:'rect',x:100,y:100,width:100,height:80,color:'#123'}]});window.setTool('lasso');});
    await p.waitForFunction(()=>window.canvasState?.pageId === 'selection' && window.canvasState.tool === 'lasso');
    await p.mouse.move(80,80);await p.mouse.down();await p.mouse.move(220,200);await p.mouse.up();
    expect(await p.evaluate(()=>window.selection.ids)).toEqual(['r']);
    await p.getByRole('button',{name:'Ask AI'}).click();
    expect(await p.evaluate(()=>window.asked.ids)).toEqual(['r']);
    await p.mouse.move(140,140);await p.mouse.down();await p.mouse.move(170,160);await p.mouse.up();
    expect(await p.evaluate(()=>window.changes.at(-1)[0])).toMatchObject({x:130,y:120});
    const handle=p.locator('[data-selection-handle]');const box=await handle.boundingBox();
    await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(330,280);await p.mouse.up();
    expect(await p.evaluate(()=>window.changes.at(-1)[0].width)).toBeGreaterThan(150);
    await p.keyboard.press('Delete');
    expect(await p.evaluate(()=>window.changes.at(-1))).toEqual([]);
  });
  it('erases a crossed element once at commit and rolls cancelled strokes back',async()=>{
    await p.evaluate(()=>{window.changes=[];window.setCanvasPage({id:'erase',paper:'blank',elements:[{id:'s',type:'stroke',points:[[100,100,.5],[200,200,.5]],width:4,color:'#123'}]});window.setTool('eraser');});
    await p.waitForFunction(()=>window.canvasState?.pageId === 'erase' && window.canvasState.tool === 'eraser');
    await p.mouse.move(150,150);await p.mouse.down();
    expect(await p.evaluate(()=>window.changes.length)).toBe(0);
    await p.mouse.up();
    expect(await p.evaluate(()=>window.changes)).toEqual([[]]);
    await p.evaluate(()=>window.setTool('pen'));
    await p.waitForFunction(()=>window.canvasState.tool === 'pen');
    await p.locator('svg.notebook-svg').dispatchEvent('pointerdown',{pointerId:12,pointerType:'pen',clientX:20,clientY:20,button:0,pressure:.5});
    await p.locator('svg.notebook-svg').dispatchEvent('pointercancel',{pointerId:12,pointerType:'pen'});
    expect(await p.evaluate(()=>window.changes.length)).toBe(1);
  });
  it('rejects palm touches while a stylus is active and after it lifts',async()=>{
    await p.evaluate(()=>{window.changes=[];window.setCanvasPage({id:'palm',paper:'blank',elements:[]});window.setTool('pen');});
    await p.waitForFunction(()=>window.canvasState.pageId === 'palm' && window.canvasState.tool === 'pen');
    const svg=p.locator('svg.notebook-svg');
    await svg.dispatchEvent('pointerdown',{pointerId:21,pointerType:'pen',clientX:20,clientY:20,button:0,pressure:.4});
    await svg.dispatchEvent('pointerdown',{pointerId:22,pointerType:'touch',clientX:50,clientY:50,button:0});
    await svg.dispatchEvent('pointerup',{pointerId:22,pointerType:'touch',clientX:50,clientY:50});
    await svg.dispatchEvent('pointerup',{pointerId:21,pointerType:'pen',clientX:20,clientY:20});
    await svg.dispatchEvent('pointerdown',{pointerId:23,pointerType:'touch',clientX:50,clientY:50,button:0});
    await svg.dispatchEvent('pointerup',{pointerId:23,pointerType:'touch',clientX:50,clientY:50});
    expect(await p.evaluate(()=>window.changes.length)).toBe(1);
  });
  it('pans the nearest canvas-scroll without committing document changes',async()=>{
    await p.evaluate(()=>{
      window.changes=[];window.setTool('hand');
      const canvas=document.querySelector('.notebook-canvas'),scroll=document.createElement('div');
      scroll.className='canvas-scroll';scroll.style.cssText='width:500px;height:400px;overflow:auto';
      canvas.parentNode.insertBefore(scroll,canvas);scroll.append(canvas);
    });
    await p.waitForFunction(()=>window.canvasState.tool === 'hand');
    await p.mouse.move(300,300);await p.mouse.down();await p.mouse.move(100,100);await p.mouse.up();
    expect(await p.evaluate(()=>document.querySelector('.canvas-scroll').scrollTop)).toBe(200);
    expect(await p.evaluate(()=>window.changes.length)).toBe(0);
    await p.evaluate(()=>{const scroll=document.querySelector('.canvas-scroll');scroll.replaceWith(...scroll.childNodes);});
  });
  it('exports full and cropped selection PNGs with paper and white background',async()=>{
    await p.evaluate(()=>{window.setCanvasPage({id:'export',paper:'grid',elements:[{id:'r',type:'rect',x:100,y:100,width:100,height:80,color:'#123'}]});window.setTool('lasso');});
    await p.waitForFunction(()=>window.canvasState?.pageId === 'export' && window.canvasState.tool === 'lasso');
    await p.mouse.move(80,80);await p.mouse.down();await p.mouse.move(220,200);await p.mouse.up();
    await p.waitForFunction(()=>window.selection?.ids.includes('r'));
    const result=await p.evaluate(async()=>{
      const full=await window.canvasRef.current.exportImage();
      const cropped=await window.canvasRef.current.exportImage(true);
      const image=new Image();image.src=cropped;await image.decode();
      return {full:full.slice(0,22),width:image.width,height:image.height};
    });
    expect(result).toMatchObject({full:'data:image/png;base64,'});
    expect(result.width).toBeLessThan(800);expect(result.height).toBeLessThan(1100);
  });
});

describe('canvas geometry', () => {
  it('builds finite smoothed centerlines and pressure-sensitive filled outlines including taps', () => {
    expect(canvas.pathFromPoints([])).toBe('');
    expect(canvas.pathFromPoints([[5,6]])).toContain('M 5 6');
    expect(canvas.pathFromPoints([[0,0],[10,20],[20,0]])).toContain('Q');
    const low = canvas.pathFromPoints([[0,0,.1],[10,0,.1]],10);
    const high = canvas.pathFromPoints([[0,0,1],[10,0,1]],10);
    expect(low).not.toEqual(high);
    expect(high.endsWith('Z')).toBe(true);
    expect(canvas.pathFromPoints([[5,5,0]],3)).not.toMatch(/NaN|Infinity/);
  });
  it('resizes selection geometry from original bounds and scales widths and text', () => {
    const input = [{id:'s',type:'stroke',points:[[0,0,.5],[10,10,1]],width:2},{id:'t',type:'text',x:5,y:5,size:10,text:'a'},{id:'r',type:'rect',x:1,y:2,width:4,height:3,strokeWidth:2},{id:'u',type:'rect',x:0,y:0,width:1,height:1}];
    const result = canvas.resizeElements(input,['s','t','r'],{x:0,y:0,width:10,height:10},{x:10,y:20,width:20,height:30});
    expect(result[0].points).toEqual([[10,20,.5],[30,50,1]]);
    expect(result[0].width).toBe(5);
    expect(result[1]).toMatchObject({x:20,y:35,size:25});
    expect(result[2]).toMatchObject({x:12,y:26,width:8,height:9,strokeWidth:5});
    expect(result[3]).toBe(input[3]);
    expect(canvas.resizeElements(input,['s'],{x:0,y:0,width:0,height:0},{x:0,y:0,width:20,height:20})[0].points.flat().every(Number.isFinite)).toBe(true);
  });
  it('moves only selected elements immutably preserving stroke pressure and metadata', () => {
    const input = [{id:'s',type:'stroke',points:[[1,2,.2],[3,4,.8]],ai:true},{id:'t',type:'text',x:10,y:20,text:'hi'},{id:'r',type:'rect',x:5,y:5,width:20,height:20}];
    const result = canvas.moveElements(input,['s','t'],5,-2);
    expect(result[0].points).toEqual([[6,0,.2],[8,2,.8]]);
    expect(result[0].ai).toBe(true);
    expect(result[1]).toMatchObject({x:15,y:18});
    expect(result[2]).toBe(input[2]);
    expect(input[0].points[0]).toEqual([1,2,.2]);
  });
  it('finds overlapping elements including boundary contact without selecting disjoint elements', () => {
    const region = {x:10,y:10,width:20,height:20};
    const a = {id:'a',type:'rect',x:0,y:0,width:10,height:10};
    const b = {id:'b',type:'ellipse',x:40,y:40,width:10,height:10};
    expect(canvas.intersectBounds(region,canvas.getBounds(a))).toBe(true);
    expect(canvas.intersectBounds(region,canvas.getBounds(b))).toBe(false);
    expect(canvas.intersectBounds(null,region)).toBe(false);
    expect(canvas.elementsInBounds([a,b],region)).toEqual([a]);
  });
  it('measures strokes with width, normalized shapes, multiline text and empty groups', () => {
    expect(canvas.getBounds({type:'stroke',width:4,points:[[10,20,.5],[30,40,1]]})).toEqual({x:8,y:18,width:24,height:24});
    expect(canvas.getBounds({type:'rect',x:30,y:40,width:-20,height:-10})).toEqual({x:10,y:30,width:20,height:10});
    expect(canvas.getBounds({type:'text',x:10,y:20,size:20,text:'ab\nc'})).toEqual({x:10,y:20,width:24,height:50});
    expect(canvas.getBounds([])).toBeNull();
    expect(canvas.getBounds([{type:'rect',x:0,y:0,width:5,height:10},{type:'rect',x:20,y:20,width:5,height:10}])).toEqual({x:0,y:0,width:25,height:30});
  });
});
