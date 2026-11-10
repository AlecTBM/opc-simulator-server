import { Namespace, AttributeIds } from 'node-opcua';
import {
  CalculationInput, CalculationStep, DeviceNode, SimulationCondition,
  SimulationConditions, SimulationValue, StateMachineTransition,
} from '../../../@types';
import Logger from './Logger';

export default class Simulator {
  namespace: Namespace;
  node: DeviceNode;
  t: number;
  private transitionElapsed = new Map<number, number>();

  constructor(namespace: Namespace, node: DeviceNode) {
    this.namespace = namespace;
    this.node = node;
    this.t = 1;
  }

  public simulateNodeValue() {
    const simulation = this.node.simulation;
    if (!simulation) return;
    if (simulation.type === 'anomaly') { this.anomaly(); return; }

    setInterval(() => {
      switch (simulation.type) {
        case 'conditional': this.conditional(); break;
        case 'mapping': if (this.conditionsSatisfied()) this.mapping(); break;
        case 'calculation': if (this.conditionsSatisfied()) this.calculation(); break;
        case 'stateMachine': this.stateMachine(); break;
        case 'increase': case 'decrease': case 'randomize': case 'sinus':
          if (this.conditionsSatisfied()) this.runSimulation(simulation.type);
          break;
      }
      if (this.t > 3200) this.t = 1;
    }, (simulation.interval || 1) * 1000);
  }

  private runSimulation(type: 'increase' | 'decrease' | 'randomize' | 'sinus') {
    if (type === 'increase') this.increase();
    else if (type === 'decrease') this.decrease();
    else if (type === 'randomize') this.randomize();
    else this.sinus();
  }

  private conditionsSatisfied(conditions = this.node.simulation?.conditions): boolean {
    if (!conditions) return true;
    if (!conditions.items.length) return false;
    const results = conditions.items.map((c) => this.evaluateCondition(c));
    return conditions.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
  }

  private evaluateCondition(condition: SimulationCondition): boolean {
    const actual = this.getNodeValue(condition.nodeNs);
    if (actual === undefined || actual === null) {
      Logger.error(`Node with namespace ${condition.nodeNs} not found`); return false;
    }
    switch (condition.operator) {
      case '==': return actual === condition.value;
      case '!=': return actual !== condition.value;
      case '<': return this.numericCompare(actual, condition.value, (a,b)=>a<b, condition);
      case '<=': return this.numericCompare(actual, condition.value, (a,b)=>a<=b, condition);
      case '>': return this.numericCompare(actual, condition.value, (a,b)=>a>b, condition);
      case '>=': return this.numericCompare(actual, condition.value, (a,b)=>a>=b, condition);
    }
  }

  private numericCompare(a: SimulationValue, b: SimulationValue, fn:(x:number,y:number)=>boolean, c:SimulationCondition) {
    if (typeof a !== 'number' || typeof b !== 'number') {
      Logger.error(`Operator ${c.operator} requires numeric values for node ${c.nodeNs}`); return false;
    }
    return fn(a,b);
  }

  private stateMachine() {
    const config = this.node.simulation?.stateMachine;
    const interval = this.node.simulation?.interval || 1;
    if (!config) return;

    if (!config.states.some((state) => this.valuesEqual(state, this.node.value))) {
      Logger.error(`State machine node ${this.node.id} has invalid current state ${this.node.value}`);
      return;
    }

    const candidates = config.transitions
      .map((transition, index) => ({ transition, index }))
      .filter(({transition}) => transition.from === undefined || this.valuesEqual(transition.from, this.node.value))
      .sort((a,b) => (b.transition.priority || 0) - (a.transition.priority || 0) || a.index - b.index);

    let selected: {transition: StateMachineTransition; index: number} | undefined;
    for (const candidate of candidates) {
      if (this.conditionsSatisfied(candidate.transition.conditions)) { selected = candidate; break; }
    }

    for (const {index} of candidates) {
      if (!selected || index !== selected.index) this.transitionElapsed.delete(index);
    }
    if (!selected) return;

    const delay = selected.transition.delay || 0;
    const elapsed = (this.transitionElapsed.get(selected.index) || 0) + interval;
    this.transitionElapsed.set(selected.index, elapsed);
    if (elapsed < delay) return;

    if (!config.states.some((state) => this.valuesEqual(state, selected!.transition.to))) {
      Logger.error(`State machine node ${this.node.id} has transition to undefined state ${selected.transition.to}`);
      return;
    }

    const oldState = this.node.value;
    this.node.value = selected.transition.to;
    this.transitionElapsed.clear();
    Logger.debug(`[Node ${this.node.id}]: State changed from ${oldState} to ${this.node.value}`);
  }

  private mapping() {
    const c=this.node.simulation?.mapping; if(!c)return;
    const source=this.getNodeValue(c.source); if(source===undefined||source===null)return;
    const key=String(source);
    if(Object.prototype.hasOwnProperty.call(c.map,key))this.node.value=c.map[key];
    else if(c.defaultValue!==undefined)this.node.value=c.defaultValue;
  }

  private calculation() {
    const c=this.node.simulation?.calculation; if(!c?.steps.length)return;
    let previous:number|undefined;
    for(const step of c.steps)previous=this.executeStep(step,previous);
    let result=this.safeNumber(previous);
    if(c.limits?.min!==undefined)result=Math.max(c.limits.min,result);
    if(c.limits?.max!==undefined)result=Math.min(c.limits.max,result);
    if(c.precision!==undefined){const f=10**c.precision;result=Math.round(result*f)/f;}
    this.node.value=this.safeNumber(result);
  }

  private executeStep(step:CalculationStep,previous?:number):number {
    if('operator'in step){
      const v=step.inputs.map(i=>this.resolveInput(i,previous));
      if(step.operator==='add')return this.safeNumber(v.reduce((a,b)=>a+b,0));
      if(step.operator==='subtract')return this.safeNumber(v.slice(1).reduce((a,b)=>a-b,v[0]));
      if(step.operator==='multiply')return this.safeNumber(v.reduce((a,b)=>a*b,1));
      return this.safeNumber(v.slice(1).reduce((a,b)=>b===0?0:a/b,v[0]));
    }
    const input=step.input?this.resolveInput(step.input,previous):this.safeNumber(previous);
    switch(step.function){
      case'negate':return this.safeNumber(-input); case'absolute':return Math.abs(input);
      case'round':return Math.round(input); case'floor':return Math.floor(input);
      case'ceil':return Math.ceil(input); case'sqrt':return input<0?0:this.safeNumber(Math.sqrt(input));
    }
  }

  private resolveInput(input:CalculationInput,previous?:number):number {
    if('previous'in input)return this.safeNumber(previous);
    if('source'in input)return this.toNumber(this.getNodeValue(input.source));
    return this.toNumber(input.value);
  }
  private toNumber(v:SimulationValue|undefined):number {
    if(typeof v==='number')return this.safeNumber(v); if(typeof v==='boolean')return v?1:0;
    if(typeof v==='string')return v.trim()===''?0:this.safeNumber(Number(v)); return 0;
  }
  private safeNumber(v:number|undefined){return typeof v==='number'&&Number.isFinite(v)?v:0;}
  private valuesEqual(a:SimulationValue,b:SimulationValue){return typeof a===typeof b&&a===b;}

  private conditional(){const s=this.node.simulation;if(s)this.node.value=this.conditionsSatisfied()?s.trueValue as SimulationValue:s.falseValue as SimulationValue;}
  private increase(){if(typeof this.node.value==='number')this.node.value+=this.node.simulation?.value||1;}
  private decrease(){if(typeof this.node.value==='number')this.node.value-=this.node.simulation?.value||1;}
  private randomize(){const c=this.node.simulation?.randomize;if(c)this.node.value=+(c.base+Math.random()*c.max-Math.random()*c.min).toFixed(2);}
  private sinus(){const c=this.node.simulation?.sinus;if(c){this.node.value=+(c.amplitude*Math.sin(this.t/50)+c.offset).toFixed(2);this.t++;}}

  private anomaly(){
    const s=this.node.simulation,c=s?.anomaly;if(!s||!c)return;const normal=this.node.value;
    let active=false,started=0,elapsed=0;
    setInterval(()=>{if(!this.conditionsSatisfied())return;
      if(active){if((Date.now()-started)/1000>=c.duration){this.node.value=normal;active=false;elapsed=0;}return;}
      elapsed+=s.interval;if(elapsed<c.min)return;const max=elapsed>=c.max;
      const progress=Math.min(1,(elapsed-c.min)/Math.max(1,c.max-c.min));
      if(max||Math.random()+progress>1+c.threshold){this.node.value=c.targetValue;active=true;started=Date.now();}
    },s.interval*1000);
  }

  private getNodeValue(nodeNs:string):SimulationValue|undefined{return this.namespace.findNode(nodeNs)?.readAttribute(null,AttributeIds.Value).value.value;}
}
