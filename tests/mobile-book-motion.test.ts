import {describe,expect,it} from 'vitest';
import {COVER_TURN_SECONDS,pageTurnDuration,packetTarget} from '../src/components/mobile-book-motion';

describe('mobile page turns',()=>{
  it('uses a stable duration per paper leaf and keeps the cover slower',()=>{
    const durations=Array.from({length:12},(_,index)=>pageTurnDuration(index+1));
    expect(pageTurnDuration(0)).toBe(COVER_TURN_SECONDS);
    expect(COVER_TURN_SECONDS).toBeGreaterThan(Math.max(...durations));
    expect(durations.every(time=>time>=1.5&&time<1.7)).toBe(true);
    expect(new Set(durations).size).toBeGreaterThan(1);
    expect(Array.from({length:12},(_,index)=>pageTurnDuration(index+1))).toEqual(durations);
  });

  it('turns the same packet back to its starting leaf',()=>{
    const destination=packetTarget(3,1,4,12);
    expect(destination).toBe(7);
    expect(packetTarget(destination,-1,4,12)).toBe(3);
  });

  it('respects the last page and turns the cover separately from a paper packet',()=>{
    expect(packetTarget(0,1,8,12)).toBe(1);
    expect(packetTarget(9,1,8,12)).toBe(12);
    expect(packetTarget(12,-1,20,12)).toBe(1);
    expect(packetTarget(1,-1,20,12)).toBe(0);
  });
});
