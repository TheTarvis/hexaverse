import { afterEach, expect, it, vi } from 'vitest'
import { bindMapBrowserGestures } from './map-browser-gestures'
let cleanup: (() => void) | undefined
afterEach(() => { cleanup?.(); document.body.replaceChildren() })
function fixture() {
 const host=document.createElement('div'),label=document.createElement('span'),control=document.createElement('button'),outside=document.createElement('div')
 control.dataset.spaceCameraControl='';host.append(label,control);document.body.append(host,outside)
 const actions={start:vi.fn(),move:vi.fn(()=>true),end:vi.fn(()=>true),cancel:vi.fn()};cleanup=bindMapBrowserGestures(host,actions);return{host,label,control,outside,actions}
}
function touch(target:Element,type:string,targets:EventTarget[]=[target]){const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:targets.map((target,identifier)=>({target,identifier}))});target.dispatchEvent(event);return event}
it('preserves touchstart and only cancels consumed map moves/end, with no document interception',()=>{
 const {host,label,actions}=fixture();const doc=vi.spyOn(document,'addEventListener');cleanup?.();cleanup=bindMapBrowserGestures(host,actions)
 expect(doc).not.toHaveBeenCalledWith(expect.stringMatching(/touch|gesture/),expect.anything(),expect.anything());doc.mockRestore()
 expect(touch(label,'touchstart').defaultPrevented).toBe(false);expect(actions.start).toHaveBeenCalled()
 expect(touch(label,'touchmove').defaultPrevented).toBe(true);expect(touch(label,'touchend',[]).defaultPrevented).toBe(true)
 const gesture=new Event('gesturestart',{cancelable:true});document.dispatchEvent(gesture);expect(gesture.defaultPrevented).toBe(false)
})
it('leaves native controls, outside-origin touches, inert maps and unconsumed taps untouched',()=>{
 const{host,label,control,outside,actions}=fixture();expect(touch(control,'touchstart').defaultPrevented).toBe(false);expect(actions.start).not.toHaveBeenCalled()
 touch(label,'touchstart',[outside,label]);expect(actions.start).not.toHaveBeenCalled();host.setAttribute('inert','');touch(label,'touchstart');expect(actions.start).not.toHaveBeenCalled();host.removeAttribute('inert')
 actions.move.mockReturnValue(false);actions.end.mockReturnValue(false);touch(label,'touchstart');expect(touch(label,'touchmove').defaultPrevented).toBe(false);expect(touch(label,'touchend',[]).defaultPrevented).toBe(false)
})
it('cleans up native touch state on cancellation/blur and removes all host listeners',()=>{
 const{label,actions}=fixture();touch(label,'touchstart');touch(label,'touchcancel',[]);expect(actions.cancel).toHaveBeenCalled();actions.move.mockClear();touch(label,'touchmove');expect(actions.move).not.toHaveBeenCalled()
 touch(label,'touchstart');window.dispatchEvent(new Event('blur'));actions.move.mockClear();touch(label,'touchmove');expect(actions.move).not.toHaveBeenCalled()
 cleanup?.();cleanup=undefined;actions.start.mockClear();touch(label,'touchstart');expect(actions.start).not.toHaveBeenCalled()
})
