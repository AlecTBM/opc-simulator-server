import { Namespace, AttributeIds } from 'node-opcua';
import { CalculationInput, CalculationStep, DeviceNode, SelectSimulation, SimulationCondition, SimulationConditions, SimulationLimits, SimulationValue, StateMachineTransition } from '../../../@types';
import Logger from './Logger';

type ConditionRuntime = { output: boolean; raw: boolean; changedAt: number };
type CycleRuntime = { phase: 'on'|'off'; elapsed: number; active: boolean };

export default class Simulator {
  namespace: Namespace; node: DeviceNode; t = 1;
  private transitionElapsed = new Map<number, number>();
  private conditionRuntime = new WeakMap<object, ConditionRuntime>();
  private cycleRuntime = new WeakMap<object, CycleRuntime>();

  constructor(namespace: Namespace,node: DeviceNode){this.namespace=namespace;this.node=node;}

  public simulateNodeValue(){
    const s=this.node.simulation;if(!s)return;
    if(s.type==='anomaly'){this.anomaly();return;}
    setInterval(()=>{this.executeTopLevel(s);if(this.t>3200)this.t=1;},(s.interval||1)*1000);
  }

  private executeTopLevel(s:NonNullable<DeviceNode['simulation']>){
    switch(s.type){
      case'conditional':this.conditional(s);break;
      case'mapping':if(this.conditionsSatisfied(s.conditions))this.mapping(s);break;
      case'calculation':if(this.conditionsSatisfied(s.conditions))this.calculation(s);break;
      case'stateMachine':this.stateMachine();break;
      case'cycle':this.cycle(s.cycle,s.conditions,s.limits);break;
      case'select':this.select();break;
      case'increase':case'decrease':case'randomize':case'sinus':if(this.conditionsSatisfied(s.conditions))this.executeSimple(s);break;
    }
  }

  private select(){
    const cfg=this.node.simulation?.select;if(!cfg)return;
    const selected=cfg.cases.find(x=>this.conditionsSatisfied(x.conditions))?.simulation ?? cfg.default;
    if(!selected)return;
    this.executeSelected(selected);
  }

  private executeSelected(s:SelectSimulation){
    switch(s.type){
      case'increase':case'decrease':case'randomize':case'sinus':this.executeSimple(s);break;
      case'conditional':this.node.value=s.trueValue as SimulationValue;this.applyLimitsToNode(s.limits);break;
      case'mapping':this.mapping(s);break;
      case'calculation':this.calculation(s);break;
      case'cycle':this.cycle(s.cycle,undefined,s.limits);break;
    }
  }

  private executeSimple(s:{type:string;value?:number;randomize?:{min:number;max:number;base:number};sinus?:{amplitude:number;offset:number};limits?:SimulationLimits}){
    switch(s.type){
      case'increase':if(typeof this.node.value==='number')this.node.value+=s.value||1;break;
      case'decrease':if(typeof this.node.value==='number')this.node.value-=s.value||1;break;
      case'randomize':if(s.randomize)this.node.value=+(s.randomize.base+Math.random()*s.randomize.max-Math.random()*s.randomize.min).toFixed(2);break;
      case'sinus':if(s.sinus){this.node.value=+(s.sinus.amplitude*Math.sin(this.t/50)+s.sinus.offset).toFixed(2);this.t++;}break;
    }
    this.applyLimitsToNode(s.limits ?? this.node.simulation?.limits);
  }

  private rawConditionsSatisfied(c?:SimulationConditions){if(!c)return true;if(!c.items.length)return false;const r=c.items.map(x=>this.evaluateCondition(x));return c.logic==='AND'?r.every(Boolean):r.some(Boolean);}
  private conditionsSatisfied(c=this.node.simulation?.conditions):boolean{
    if(!c)return true;const raw=this.rawConditionsSatisfied(c),now=Date.now();let st=this.conditionRuntime.get(c as object);
    if(!st){const initialDelay=raw?(c.delay?.on||0):(c.delay?.off||0);st={output:initialDelay===0?raw:!raw,raw,changedAt:now};this.conditionRuntime.set(c as object,st);return st.output;}
    if(raw!==st.raw){st.raw=raw;st.changedAt=now;}
    if(raw!==st.output){const delay=raw?(c.delay?.on||0):(c.delay?.off||0);if((now-st.changedAt)/1000>=delay)st.output=raw;}
    return st.output;
  }
  private evaluateCondition(c:SimulationCondition){const a=this.getNodeValue(c.nodeNs);if(a===undefined||a===null)return false;switch(c.operator){case'==':return a===c.value;case'!=':return a!==c.value;case'<':return this.numCmp(a,c.value,(x,y)=>x<y);case'<=':return this.numCmp(a,c.value,(x,y)=>x<=y);case'>':return this.numCmp(a,c.value,(x,y)=>x>y);case'>=':return this.numCmp(a,c.value,(x,y)=>x>=y);}}
  private numCmp(a:SimulationValue,b:SimulationValue,f:(x:number,y:number)=>boolean){return typeof a==='number'&&typeof b==='number'?f(a,b):false;}

  private cycle(c?:{onDuration:number;offDuration:number;onValue:SimulationValue;offValue:SimulationValue;inactiveValue?:SimulationValue},conditions?:SimulationConditions,limits?:SimulationLimits){
    if(!c)return;const key=c as object;let st=this.cycleRuntime.get(key);if(!st){st={phase:'on',elapsed:0,active:false};this.cycleRuntime.set(key,st);}
    const active=this.conditionsSatisfied(conditions);
    if(!active){st.active=false;st.phase='on';st.elapsed=0;if(c.inactiveValue!==undefined)this.node.value=c.inactiveValue;this.applyLimitsToNode(limits);return;}
    if(!st.active){st.active=true;st.phase='on';st.elapsed=0;this.node.value=c.onValue;this.applyLimitsToNode(limits);return;}
    st.elapsed+=this.node.simulation?.interval||1;const duration=st.phase==='on'?c.onDuration:c.offDuration;
    if(st.elapsed>=duration){st.phase=st.phase==='on'?'off':'on';st.elapsed=0;this.node.value=st.phase==='on'?c.onValue:c.offValue;this.applyLimitsToNode(limits);}
  }

  private stateMachine(){const c=this.node.simulation?.stateMachine,interval=this.node.simulation?.interval||1;if(!c)return;const candidates=c.transitions.map((transition,index)=>({transition,index})).filter(x=>x.transition.from===undefined||this.eq(x.transition.from,this.node.value)).sort((a,b)=>(b.transition.priority||0)-(a.transition.priority||0)||a.index-b.index);let selected:{transition:StateMachineTransition,index:number}|undefined;for(const x of candidates){if(this.conditionsSatisfied(x.transition.conditions)){selected=x;break;}}for(const x of candidates)if(!selected||x.index!==selected.index)this.transitionElapsed.delete(x.index);if(!selected)return;const elapsed=(this.transitionElapsed.get(selected.index)||0)+interval;this.transitionElapsed.set(selected.index,elapsed);if(elapsed<(selected.transition.delay||0))return;this.node.value=selected.transition.to;this.transitionElapsed.clear();}
  private conditional(s:{conditions?:SimulationConditions;trueValue?:SimulationValue;falseValue?:SimulationValue;limits?:SimulationLimits}){this.node.value=this.conditionsSatisfied(s.conditions)?s.trueValue as SimulationValue:s.falseValue as SimulationValue;this.applyLimitsToNode(s.limits);}
  private mapping(s:{mapping?:any;limits?:SimulationLimits}){const c=s.mapping;if(!c)return;const v=this.getNodeValue(c.source);if(v===undefined||v===null)return;const k=String(v);if(Object.prototype.hasOwnProperty.call(c.map,k))this.node.value=c.map[k];else if(c.defaultValue!==undefined)this.node.value=c.defaultValue;this.applyLimitsToNode(s.limits);}
  private calculation(s:{calculation?:any;limits?:SimulationLimits}){const c=s.calculation;if(!c?.steps.length)return;let p:number|undefined;for(const step of c.steps)p=this.executeStep(step,p);let r=this.safe(p);const lim=s.limits??c.limits;if(lim?.min!==undefined)r=Math.max(lim.min,r);if(lim?.max!==undefined)r=Math.min(lim.max,r);if(c.precision!==undefined){const f=10**c.precision;r=Math.round(r*f)/f;}this.node.value=this.safe(r);}
  private executeStep(step:CalculationStep,p?:number):number{if('operator'in step){const v=step.inputs.map(i=>this.resolve(i,p));if(step.operator==='add')return this.safe(v.reduce((a,b)=>a+b,0));if(step.operator==='subtract')return this.safe(v.slice(1).reduce((a,b)=>a-b,v[0]));if(step.operator==='multiply')return this.safe(v.reduce((a,b)=>a*b,1));return this.safe(v.slice(1).reduce((a,b)=>b===0?0:a/b,v[0]));}const x=step.input?this.resolve(step.input,p):this.safe(p);switch(step.function){case'negate':return-x;case'absolute':return Math.abs(x);case'round':return Math.round(x);case'floor':return Math.floor(x);case'ceil':return Math.ceil(x);case'sqrt':return x<0?0:this.safe(Math.sqrt(x));}}
  private resolve(i:CalculationInput,p?:number){if('previous'in i)return this.safe(p);if('source'in i)return this.toNum(this.getNodeValue(i.source));return this.toNum(i.value);}
  private toNum(v:SimulationValue|undefined){if(typeof v==='number')return this.safe(v);if(typeof v==='boolean')return v?1:0;if(typeof v==='string')return v.trim()===''?0:this.safe(Number(v));return 0;}
  private safe(v:number|undefined){return typeof v==='number'&&Number.isFinite(v)?v:0;}
  private eq(a:SimulationValue,b:SimulationValue){return typeof a===typeof b&&a===b;}
  private applyLimitsToNode(l?:SimulationLimits){if(typeof this.node.value!=='number'||!l)return;if(l.min!==undefined)this.node.value=Math.max(l.min,this.node.value);if(l.max!==undefined)this.node.value=Math.min(l.max,this.node.value);}

  private anomaly(){const s=this.node.simulation,c=s?.anomaly;if(!s||!c)return;const normal=this.node.value;let active=false,started=0,elapsed=0;setInterval(()=>{if(!this.conditionsSatisfied())return;if(active){if((Date.now()-started)/1000>=c.duration){this.node.value=normal;active=false;elapsed=0;}return;}elapsed+=s.interval;if(elapsed<c.min)return;const max=elapsed>=c.max,progress=Math.min(1,(elapsed-c.min)/Math.max(1,c.max-c.min));if(max||Math.random()+progress>1+c.threshold){this.node.value=c.targetValue;active=true;started=Date.now();}},s.interval*1000);}
  private getNodeValue(id:string):SimulationValue|undefined{return this.namespace.findNode(id)?.readAttribute(null,AttributeIds.Value).value.value;}
}
