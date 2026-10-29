import { useSyncExternalStore } from 'react';
import { MotionConfig } from 'motion/react';
import Sketchbook from './sketch/Sketchbook';
const media = window.matchMedia('(max-width: 768px)');
const subscribe = (callback: () => void) => { media.addEventListener('change', callback); return () => media.removeEventListener('change', callback); };
export default function App() {
  const mobile = useSyncExternalStore(subscribe, () => media.matches, () => false);
  return <MotionConfig reducedMotion="user"><Sketchbook mobile={mobile} /></MotionConfig>;
}
