export type BookPose = {center: number;left: number;width: number;leftRadius: number;rightRadius: number;leftContact: number;rightContact: number};
export function restingBookPose(page: number,pageCount: number): BookPose {
  if(page===0)return {center:-.5,left:1,width:1,leftRadius:0,rightRadius:16,leftContact:0,rightContact:1};
  if(page===pageCount-1)return {center:.5,left:0,width:1,leftRadius:16,rightRadius:0,leftContact:1,rightContact:0};
  return {center:0,left:0,width:2,leftRadius:14,rightRadius:14,leftContact:1,rightContact:1};
}
export function coverTurnSide(from: number,direction: number,pageCount: number): 'front'|'back'|null {
  if((from===0&&direction===0)||(from===1&&direction===1))return 'front';
  if((from===pageCount-3&&direction===0)||(from===pageCount-1&&direction===1))return 'back';
  return null;
}
// Fractions are measured in page widths. The same cover progress moves the
// book, ground footprint and navigation; nothing starts after the cover lands.
export function turningBookPose(from: number,direction: number,progress: number,pageCount: number): BookPose {
  const last=pageCount-1;
  const target=from===0&&direction===0?1:from===1&&direction===1?0:from===last-2&&direction===0?last:from===last&&direction===1?last-2:from;
  const start=restingBookPose(from,pageCount),end=restingBookPose(target,pageCount);
  const t=Math.max(0,Math.min(1,progress));
  const mix=(a:number,b:number)=>a+(b-a)*t;
  // A raised board has no rectangular contact footprint. Its contact shadow
  // joins only as it settles flat, and leaves as it lifts, in either direction.
  const smooth=(value:number)=>{const x=Math.max(0,Math.min(1,value));return x*x*(3-2*x);};
  const contact=(a:number,b:number)=>a===b?a:a<b?smooth((t-.82)/.18):1-smooth(t/.18);
  return {center:mix(start.center,end.center),left:mix(start.left,end.left),width:mix(start.width,end.width),leftRadius:mix(start.leftRadius,end.leftRadius),rightRadius:mix(start.rightRadius,end.rightRadius),leftContact:contact(start.leftContact,end.leftContact),rightContact:contact(start.rightContact,end.rightContact)};
}
