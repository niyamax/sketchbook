import {describe,it,expect} from 'vitest';
import {BOOK_LIGHT,projectShadow,nativeShadowEnvelope} from '../src/sketch/lighting';
describe('one upper-left key light',()=>{
 it('casts toward the lower right, independently of turn direction',()=>{
  expect(BOOK_LIGHT.x).toBeLessThan(0);expect(BOOK_LIGHT.y).toBeGreaterThan(0);
  for(const x of [-1,0,1]){const p=projectShadow({x,y:0,z:.2});expect(p.x).toBeGreaterThan(x);expect(p.y).toBeGreaterThan(0);}
 });
 it('keeps contact fixed and scales offset with height',()=>{
  expect(projectShadow({x:2,y:3,z:0})).toEqual({x:2,y:3});
  const near=projectShadow({x:0,y:0,z:1}),far=projectShadow({x:0,y:0,z:2});expect(far.x).toBeCloseTo(near.x*2);expect(far.y).toBeCloseTo(near.y*2);
 });
});

describe('native gradient handoff',()=>{
 it('is invisible at both resting poses and fades symmetrically',()=>{
  expect(nativeShadowEnvelope(0)).toBe(0);expect(nativeShadowEnvelope(1)).toBeCloseTo(0,12);
  expect(nativeShadowEnvelope(.001)).toBeLessThan(.00002);
  expect(nativeShadowEnvelope(.999)).toBeLessThan(.00002);
  expect(nativeShadowEnvelope(.25)).toBeCloseTo(nativeShadowEnvelope(.75));
  expect(nativeShadowEnvelope(.5)).toBeCloseTo(1);
 });
});
