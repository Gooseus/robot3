function valueEnumerable(value) {
  return { enumerable: true, value };
}

function valueEnumerableWritable(value) {
  return { enumerable: true, writable: true, value };
}

let truthy = () => true;
let empty = () => ({});
let identity = a => a;
let create = (a, b) => Object.freeze(Object.create(a, b));

function stack(fns) {
  return fns.reduce((par, fn) => {
    return function(...args) {
      return fn.apply(this, args);
    };
  }, truthy);
}

function fnType(fn) {
  return create(this, { fn: valueEnumerable(fn) });
}

let actionType = {};
export let action = fnType.bind(actionType);

let reduceType = {};
export let reduce = fnType.bind(reduceType);

let guardType = {};
export let guard = fnType.bind(guardType);

function filter(Type, arr) {
  return arr.filter(value => Type.isPrototypeOf(value));
}

function extractActions(args) {
  let guards = stack(filter(guardType, args).map(t => t.fn));
  let reducers = stack(filter(reduceType, args).map(t => t.fn));
  return [guards, reducers];
}

const transitionType = {};
export function transition(from, to, ...args) {
  let [guards, reducers] = extractActions(args);
  return create(transitionType, {
    from: valueEnumerable(from),
    to: valueEnumerable(to),
    guards: valueEnumerable(guards),
    reducers: valueEnumerable(reducers)
  });
}

const immediateType = {};
export function immediate(to, ...args) {
  let [guards, reducers] = extractActions(args);
  return create(transitionType, {
    to: valueEnumerable(to),
    guards: valueEnumerable(guards),
    reducers: valueEnumerable(reducers)
  });
}

function enterImmediate() {
  debugger;
}

function transitionsToMap(transitions) {
  let m = new Map();
  for(let t of transitions) {
    if(!m.has(t.from)) m.set(t.from, []);
    m.get(t.from).push(t);
  }
  return m;
}

const stateType = { enter: identity };
export function state(...args) {
  let transitions = filter(transitionType, args);
  let immediates = filter(immediateType, args);
  let desc = {
    transitions: valueEnumerable(transitionsToMap(transitions))
  };
  debugger;
  if(immediates.length) {
    desc.immediates = valueEnumerable(immediates);
    desc.enter = valueEnumerable(enterImmediate);
  }
  return create(stateType, desc);
}

let invokeType = {};
export function invoke(fn, ...transitions) {
  return create(invokeType, {
    fn: valueEnumerable(fn),
    transitions: valueEnumerable(transitionsToMap(transitions))
  });
}

let machine = {
  get state() {
    return {
      name: this.current,
      value: this.states[this.current]
    };
  }
};
export function createMachine(states, contextFn) {
  let current = Object.keys(states)[0];
  return create(machine, {
    context: valueEnumerable(contextFn || empty),
    current: valueEnumerable(current),
    states: valueEnumerable(states)
  });
}

export function send(service, event) {
  let eventName = event.type || event;
  let { machine, context } = service;
  let { value: state } = machine.state;
  
  if(state.transitions.has(eventName)) {
    for(let { to, guards, reducers } of state.transitions.get(eventName)) {  
      if(guards(context)) {
        service.context = reducers.call(service, event, context);

        let original = machine.original || machine;
        let newMachine = create(original, {
          current: valueEnumerable(to),
          original: { value: original }
        });

        let state = newMachine.state.value;
        if(invokeType.isPrototypeOf(state)) {
          run(service, state, event);
        } else {
          return state.enter(newMachine);
        }
      }
    }
  }
  
  return machine;
}

function run(service, invoker, event) {
  invoker.fn.call(service, service.context, event)
    .then(data => service.send({ type: 'done', data }))
    .catch(error => service.send({ type: 'error', error }));
}


let service = {
  send(event) {
    this.machine = send(this, event);
    
    // TODO detect change
    this.onChange(this);
  }
};
export function interpret(machine, onChange) {
  let s = Object.create(service, {
    machine: valueEnumerableWritable(machine),
    context: valueEnumerableWritable(machine.context()),
    onChange: valueEnumerable(onChange)
  });
  s.send = s.send.bind(s);
  return s;
}