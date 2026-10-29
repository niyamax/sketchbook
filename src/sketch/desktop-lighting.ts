import {nativeShadowEnvelope,projectShadow} from './lighting';
import {coverTurnSide,restingBookPose,turningBookPose,type BookPose} from './book-pose';
export type LightingEngine = {
  getRender: () => {getRect: () => {left: number;top: number;width: number;height: number;pageWidth: number}};
  getFlipController: () => {getCalculation: () => {getFlippingProgress: () => number;getDirection: () => number}|null};
  getState: () => string;
  getCurrentPageIndex: () => number;
  getPageCount: () => number;
};

// PageFlip owns the fold and gradient geometry. One progress clock positions
// the book, its CSS ground shadow and side arrows during cover turns.
export function installDesktopLighting(engine: LightingEngine,frame: HTMLElement) {
  const target=frame.querySelector<HTMLElement>('.stf__block');
  if(!target)return {update(_state?:string) {},dispose() {}};
  const block:HTMLElement=target;
  const wrapper=frame.querySelector<HTMLElement>('.sketch-desktop-book');
  const navigation=frame.querySelector<HTMLElement>('.sketch-side-navigation');
  const ground=document.createElement('div');ground.className='sketch-static-ground';ground.setAttribute('aria-hidden','true');
  Object.assign(ground.style,{position:'absolute',zIndex:'0',pointerEvents:'none'});block.append(ground);
  const contacts=[document.createElement('div'),document.createElement('div')];
  contacts.forEach((contact,index)=>{contact.className=`sketch-ground-contact is-${index===0?'left':'right'}`;ground.append(contact);});
  const coverShade=document.createElement('div');coverShade.className='sketch-cover-contact';coverShade.setAttribute('aria-hidden','true');block.append(coverShade);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let animation=0,disposed=false,from:number|null=null,lastPose='';
  function apply(pose:BookPose) {
    const r=engine.getRender().getRect(),offset=projectShadow({x:0,y:0,z:r.pageWidth*.025});
    const key=`${r.left}:${r.top}:${r.height}:${r.pageWidth}:${pose.center}:${pose.left}:${pose.width}:${pose.leftRadius}:${pose.rightRadius}:${pose.leftContact}:${pose.rightContact}`;
    if(key===lastPose)return;
    if(wrapper)wrapper.style.transform=`translateX(${pose.center*r.pageWidth}px)`;
    if(navigation)navigation.style.width=`${pose.width*r.pageWidth}px`;
    Object.assign(ground.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`});
    contacts.forEach((contact,index)=>Object.assign(contact.style,{left:`${index*r.pageWidth}px`,width:`${r.pageWidth}px`,height:`${r.height}px`,borderRadius:index===0?'14px 0 0 14px':'0 14px 14px 0',opacity:String(index===0?pose.leftContact:pose.rightContact),boxShadow:`${offset.x}px ${offset.y}px ${r.pageWidth*.018}px rgba(20,20,20,.075)`}));
    lastPose=key;
  }
  function rest() {
    apply(restingBookPose(engine.getCurrentPageIndex(),engine.getPageCount()));
    navigation?.classList.remove('is-cover-moving');
    block.style.setProperty('--sketch-native-shadow','0');
    coverShade.style.opacity='0';
    from=null;
  }
  function step() {
    animation=0;if(disposed)return;
    const active=engine.getState()!=='read';
    const calc=engine.getFlipController().getCalculation();
    if(active&&calc&&!reduced.matches) {
      if(from===null)from=engine.getCurrentPageIndex();
      const progress=calc.getFlippingProgress()/100;
      const cover=coverTurnSide(from,calc.getDirection(),engine.getPageCount());
      navigation?.classList.toggle('is-cover-moving',!!cover);
      apply(turningBookPose(from,calc.getDirection(),progress,engine.getPageCount()));
      const envelope=nativeShadowEnvelope(progress);
      block.style.setProperty('--sketch-native-shadow',String(cover?0:envelope));
      if(cover) {
        const r=engine.getRender().getRect(),width=r.pageWidth*.18;
        Object.assign(coverShade.style,{left:`${r.left+r.pageWidth-(cover==='back'?width:0)}px`,top:`${r.top}px`,width:`${width}px`,height:`${r.height}px`,background:`linear-gradient(to ${cover==='front'?'right':'left'},rgba(20,20,20,.085),transparent)`,opacity:String(envelope)});
      } else coverShade.style.opacity='0';
    } else if(!active)rest();
    if(active)animation=requestAnimationFrame(step);
  }
  return {
    update(state?:string) {
      // PageFlip emits a state event before changing the getter's value.
      if((state??engine.getState())==='read') {
        cancelAnimationFrame(animation);animation=0;rest();
      } else {
        if(from===null)from=engine.getCurrentPageIndex();
        const calc=engine.getFlipController().getCalculation();
        if(calc&&coverTurnSide(from,calc.getDirection(),engine.getPageCount()))navigation?.classList.add('is-cover-moving');
        if(!animation)animation=requestAnimationFrame(step);
      }
    },
    dispose() {disposed=true;cancelAnimationFrame(animation);navigation?.classList.remove('is-cover-moving');block.style.removeProperty('--sketch-native-shadow');ground.remove();coverShade.remove();},
  };
}
