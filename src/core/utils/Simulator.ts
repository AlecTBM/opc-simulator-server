import { Namespace, AttributeIds } from 'node-opcua';
import { CalculationInput, CalculationStep, DeviceNode, SimulationCondition, SimulationConditions, SimulationValue, StateMachineTransition } from '../../../@types';
import Logger from './Logger';

type ConditionRuntime = { output: boolean; raw: boolean; changedAt: number };

export default class Simulator {
  namespace: Namespace; node: DeviceNode; t = 1;
  private transitionElapsed = new Map<number, number>();
  private conditionRuntime = new WeakMap<object, ConditionRuntime>();
  private cyclePhase: 'on'|'off' = 'on';
  private cycleElapsed = 0;
  private cycleWasActive = false;

  constructor(namespace: Namespace,node: DeviceNode){this.namespace=namespace;this.node=node;}

  public simulateNodeValue(){
    const s=this.node.simulation;if(!s)return;
    if(s.type==='anomaly'){this.anomaly();return;}
    setInterval(()=>{
      switch(s.type){
        case'conditional':this.conditional();break;
        case'mapping':if(this.conditionsSatisfied())this.mapping();break;
        case'calculation':if(this.conditionsSatisfied())this.calculation();break;
        case'stateMachine':this.stateMachine();break;
        case'cycle':this.cycle();break;
        case'increase':case'decrease':case'randomize':case'sinus':if(this.conditionsSatisfied())this.runSimulation(s.type);break;
      }
      if(this.t>3200)this.t=1;
    },(s.interval||1)*1000);
  }

  private rawConditionsSatisfied(c?:SimulationConditions){
    if(!c)return true;if(!c.items.length)return false;
    const r=c.items.map(x=>this.evaluateCondition(x));return c.logic==='AND'?r.every(Boolean):r.some(Boolean);
  }

  private conditionsSatisfied(c=this.node.simulation?.conditions):boolean{
    if(!c)return true;
    const raw=this.rawConditionsSatisfied(c);const now=Date.now();
    let st=this.conditionRuntime.get(c as object);
    if(!st){st={output:raw,raw,changedAt:now};this.conditionRuntime.set(c as object,st);return st.output;}
    if(raw!==st.raw){st.raw=raw;st.changedAt=now;}
    if(raw!==st.output){const delay=raw?(c.delay?.on||0):(c.delay?.off||0);if((now-st.changedAt)/1000>=delay)st.output=raw;}
    return st.output;
  }

  private evaluateCondition(c:SimulationCondition){const a=this.getNodeValue(c.nodeNs);if(a===undefined||a===null)return false;switch(c.operator){case'==':return a===c.value;case'!=':return a!==c.value;case'<':return this.numCmp(a,c.value,(x,y)=>x<y);case'<=':return this.numCmp(a,c.value,(x,y)=>x<=y);case'>':return this.numCmp(a,c.value,(x,y)=>x>y);case'>=':return this.numCmp(a,c.value,(x,y)=>x>=y);}}
  private numCmp(a:SimulationValue,b:SimulationValue,f:(x:number,y:number)=>boolean){return typeof a==='number'&&typeof b==='number'?f(a,b):false;}

  private cycle(){
    const s=this.node.simulation!,c=s.cycle;if(!c)return;const active=this.conditionsSatisfied();
    if(!active){this.cycleWasActive=false;this.cyclePhase='on';this.cycleElapsed=0;if(c.inactiveValue!==undefined)this.node.value=c.inactiveValue;return;}
    if(!this.cycleWasActive){this.cycleWasActive=true;this.cyclePhase='on';this.cycleElapsed=0;this.node.value=c.onValue;return;}
    this.cycleElapsed+=s.interval;
    const duration=this.cyclePhase==='on'?c.onDuration:c.offDuration;
    if(this.cycleElapsed>=duration){this.cyclePhase=this.cyclePhase==='on'?'off':'on';this.cycleElapsed=0;this.node.value=this.cyclePhase==='on'?c.onValue:c.offValue;}
  }

  private stateMachine(){const c=this.node.simulation?.stateMachine,interval=this.node.simulation?.interval||1;if(!c)return;const candidates=c.transitions.map((transition,index)=>({transition,index})).filter(x=>x.transition.from===undefined||this.eq(x.transition.from,this.node.value)).sort((a,b)=>(b.transition.priority||0)-(a.transition.priority||0)||a.index-b.index);let selected:{transition:StateMachineTransition,index:number}|undefined;for(const x of candidates){if(this.conditionsSatisfied(x.transition.conditions)){selected=x;break;}}for(const x of candidates)if(!selected||x.index!==selected.index)this.transitionElapsed.delete(x.index);if(!selected)return;const elapsed=(this.transitionElapsed.get(selected.index)||0)+interval;this.transitionElapsed.set(selected.index,elapsed);if(elapsed<(selected.transition.delay||0))return;this.node.value=selected.transition.to;this.transitionElapsed.clear();}
  private runSimulation(t:'increase'|'decrease'|'randomize'|'sinus'){if(t==='increase')this.increase();else if(t==='decrease')this.decrease();else if(t==='randomize')this.randomize();else this.sinus();}
  private conditional(){const s=this.node.simulation!;this.node.value=this.conditionsSatisfied()?s.trueValue as SimulationValue:s.falseValue as SimulationValue;}
  private mapping(){const c=this.node.simulation?.mapping;if(!c)return;const v=this.getNodeValue(c.source);if(v===undefined||v===null)return;const k=String(v);if(Object.prototype.hasOwnProperty.call(c.map,k))this.node.value=c.map[k];else if(c.defaultValue!==undefined)this.node.value=c.defaultValue;}
  private calculation(){const c=this.node.simulation?.calculation;if(!c?.steps.length)return;let p:number|undefined;for(const step of c.steps)p=this.executeStep(step,p);let r=this.safe(p);if(c.limits?.min!==undefined)r=Math.max(c.limits.min,r);if(c.limits?.max!==undefined)r=Math.min(c.limits.max,r);if(c.precision!==undefined){const f=10**c.precision;r=Math.round(r*f)/f;}this.node.value=this.safe(r);}
  private executeStep(step:CalculationStep,p?:number):number{if('operator'in step){const v=step.inputs.map(i=>this.resolve(i,p));if(step.operator==='add')return this.safe(v.reduce((a,b)=>a+b,0));if(step.operator==='subtract')return this.safe(v.slice(1).reduce((a,b)=>a-b,v[0]));if(step.operator==='multiply')return this.safe(v.reduce((a,b)=>a*b,1));return this.safe(v.slice(1).reduce((a,b)=>b===0?0:a/b,v[0]));}const x=step.input?this.resolve(step.input,p):this.safe(p);switch(step.function){case'negate':return-x;case'absolute':return Math.abs(x);case'round':return Math.round(x);case'floor':return Math.floor(x);case'ceil':return Math.ceil(x);case'sqrt':return x<0?0:this.safe(Math.sqrt(x));}}
  private resolve(i:CalculationInput,p?:number){if('previous'in i)return this.safe(p);if('source'in i)return this.toNum(this.getNodeValue(i.source));return this.toNum(i.value);}
  private toNum(v:SimulationValue|undefined){if(typeof v==='number')return this.safe(v);if(typeof v==='boolean')return v?1:0;if(typeof v==='string')return v.trim()===''?0:this.safe(Number(v));return 0;}
  private safe(v:number|undefined){return typeof v==='number'&&Number.isFinite(v)?v:0;}
  private eq(a:SimulationValue,b:SimulationValue){return typeof a===typeof b&&a===b;}
  private increase(){if(typeof this.node.value==='number')this.node.value+=this.node.simulation?.value||1;}
  private decrease(){if(typeof this.node.value==='number')this.node.value-=this.node.simulation?.value||1;}
  private randomize(){const c=this.node.simulation?.randomize;if(c)this.node.value=+(c.base+Math.random()*c.max-Math.random()*c.min).toFixed(2);}
  private sinus(){const c=this.node.simulation?.sinus;if(c){this.node.value=+(c.amplitude*Math.sin(this.t/50)+c.offset).toFixed(2);this.t++;}}
  private anomaly(){const s=this.node.simulation,c=s?.anomaly;if(!s||!c)return;const normal=this.node.value;let active=false,started=0,elapsed=0;setInterval(()=>{if(!this.conditionsSatisfied())return;if(active){if((Date.now()-started)/1000>=c.duration){this.node.value=normal;active=false;elapsed=0;}return;}elapsed+=s.interval;if(elapsed<c.min)return;const max=elapsed>=c.max,progress=Math.min(1,(elapsed-c.min)/Math.max(1,c.max-c.min));if(max||Math.random()+progress>1+c.threshold){this.node.value=c.targetValue;active=true;started=Date.now();}},s.interval*1000);}
  private getNodeValue(id:string):SimulationValue|undefined{return this.namespace.findNode(id)?.readAttribute(null,AttributeIds.Value).value.value;}
}
