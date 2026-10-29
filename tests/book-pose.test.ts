import {describe,it,expect} from 'vitest';
import {restingBookPose,turningBookPose} from '../src/sketch/book-pose';
describe('cover-linked centering',()=>{
 it('moves before the cover finishes, for both covers and directions',()=>{
  for(const [from,direction,to]of[[0,0,1],[1,1,0],[11,0,13],[13,1,11]]){
   const start=restingBookPose(from,14),end=restingBookPose(to,14);
   expect(turningBookPose(from,direction,0,14)).toEqual(start);
   expect(turningBookPose(from,direction,1,14)).toEqual(end);
   const middle=turningBookPose(from,direction,.5,14);
   expect(middle.center).toBeCloseTo((start.center+end.center)/2);
   expect(middle.width).toBe(1.5);
  }
 });
 it('keeps the visible footprint centered throughout opening, closing and reversal',()=>{
  for(const [from,direction]of[[0,0],[1,1],[11,0],[13,1]])for(let i=0;i<=20;i++){
   const pose=turningBookPose(from,direction,i/20,14);
   expect(pose.center+pose.left+pose.width/2).toBeCloseTo(1);
  }
  expect(turningBookPose(0,0,.25,14).center).toBeCloseTo(turningBookPose(1,1,.75,14).center);
 });
 it('leaves an ordinary open-book page turn stationary',()=>{
  expect(turningBookPose(5,0,.5,14)).toEqual(restingBookPose(5,14));
 });
 it('keeps floor contact under flat pages, rather than an expanding rectangle under the lifted cover',()=>{
  for(const [from,direction,hinged]of[[0,0,'leftContact'],[1,1,'leftContact'],[11,0,'rightContact'],[13,1,'rightContact']] as const){
   const base=hinged==='leftContact'?'rightContact':'leftContact';
   for(const t of[.2,.5,.8]){
    expect(turningBookPose(from,direction,t,14)[hinged]).toBe(0);
    expect(turningBookPose(from,direction,t,14)[base]).toBe(1);
   }
  }
  const settling=turningBookPose(0,0,.9,14).leftContact;
  expect(settling).toBeGreaterThan(0);expect(settling).toBeLessThan(1);
  expect(settling).toBeCloseTo(turningBookPose(1,1,.1,14).leftContact);
 });
});
