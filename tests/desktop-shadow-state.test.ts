// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {installDesktopLighting,type LightingEngine} from '../src/sketch/desktop-lighting';
afterEach(()=>{vi.unstubAllGlobals();document.body.innerHTML='';});
it('uses the state event before PageFlip updates its getter, clearing the final shadow synchronously',()=>{
  const frames=new Map<number,FrameRequestCallback>();let id=0,state='read',page=0;
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++id,callback);return id;});
  vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key));
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  const frame=document.createElement('div');frame.innerHTML='<div class="sketch-desktop-book"><div class="stf__block"></div></div><nav class="sketch-side-navigation"></nav>';document.body.append(frame);
  const engine:LightingEngine={
    getRender:()=>({getRect:()=>({left:0,top:0,width:880,height:550,pageWidth:440})}),
    getFlipController:()=>({getCalculation:()=>({getFlippingProgress:()=>50,getDirection:()=>0})}),getState:()=>state,getCurrentPageIndex:()=>page,getPageCount:()=>14,
  };
  const lighting=installDesktopLighting(engine,frame);
  lighting.update('flipping'); // The getter intentionally still says "read".
  expect(frames.size).toBe(1);
  expect(frame.querySelector('nav')!.classList.contains('is-cover-moving')).toBe(true);
  state='flipping';page=1;
  const [key,callback]=[...frames.entries()][0];frames.delete(key);callback(0);
  const block=frame.querySelector<HTMLElement>('.stf__block')!;
  expect(block.style.getPropertyValue('--sketch-native-shadow')).toBe('0');
  expect(Number(frame.querySelector<HTMLElement>('.sketch-cover-contact')!.style.opacity)).toBeGreaterThan(0);
  expect(frame.querySelector<HTMLElement>('.sketch-static-ground')!.style.boxShadow).toBe('');
  expect(frame.querySelector<HTMLElement>('.sketch-ground-contact.is-left')!.style.opacity).toBe('0');
  expect(frame.querySelector<HTMLElement>('.sketch-ground-contact.is-right')!.style.opacity).toBe('1');
  expect(frame.querySelector<HTMLElement>('.sketch-desktop-book')!.style.transform).toBe('translateX(-110px)');
  expect(frames.size).toBe(1);
  page=0;lighting.update('read'); // The getter intentionally still says "flipping".
  expect(frame.querySelector('nav')!.classList.contains('is-cover-moving')).toBe(false);
  expect(block.style.getPropertyValue('--sketch-native-shadow')).toBe('0');
  expect(frame.querySelector<HTMLElement>('.sketch-cover-contact')!.style.opacity).toBe('0');
  expect(frame.querySelector<HTMLElement>('.sketch-ground-contact.is-left')!.style.opacity).toBe('0');
  expect(frames.size).toBe(0);
  lighting.dispose();
});
