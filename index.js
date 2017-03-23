'use strict'

const KineticObjectStream = require('./lib/stream')
const KineticReactor = require('./lib/reactor')
const KineticEssence = require('./lib/essence')

const debug = require('debug')
const path = require('path')

const kos = new KineticObjectStream('core')
  .summary('Provides KOS flow loading & logging facility')
  .in('load').out('kos').bind(loadFlow)
  .in('log').bind(setupLogger)

function loadFlow(name) {
  let flow = {}
  let search = [ 
    path.resolve(name),
    path.resolve(path.join('flows', name)),
    path.resolve(__dirname, path.join('flows', name)),
    name
  ]
  for (let name of search) {
    try { flow = require(name)(kos); break }
    catch (e) { 
      if (e.code !== 'MODULE_NOT_FOUND') throw e
    }
  }
  if (flow.type !== 'KineticObjectStream')
    throw new Error("unable to load KOS for " + name + " from " + search)

  this.stream.include(flow)
  this.send('kos', flow)
}

function setupLogger({ verbose=0, silent=false }) {
  if (silent) return

  let namespaces = [ 'kos:error', 'kos:warn' ]
  if (verbose)     namespaces.push('kos:info')
  if (verbose > 1) namespaces.push('kos:debug')
  if (verbose > 2) namespaces.push('kos:trace')
  debug.enable(namespaces.join(','))

  let error = debug('kos:error')
  let warn  = debug('kos:warn')
  let info  = debug('kos:info')
  let log   = debug('kos:debug')
  let trace = debug('kos:trace')

  if (!this.get('initialized')) {
    this.stream.on('data', ({ key, value }) => {
      switch (key) {
      case 'error':
        if (verbose > 1) error(value)
        else error(value.message)
        break
      case 'warn':  warn(...value); break
      case 'info':  info(...value); break
      case 'debug': log(...value); break
      default:
        // if (key === 'kos')
        //   trace(render(value)+"\n")
        if (typeof value === 'object')
          trace('%s\n%O\n', key, value)
        else
          trace('%s %o', key, value)
      }
    })
    this.set('initialized', true)
  }
}

// expose class definitions
kos.Stream  = KineticObjectStream
kos.Reactor = KineticReactor
kos.Essence = KineticEssence

global.kos = module.exports = kos['default'] = kos.kos = kos

// don't need this?
function chain(...flows) {
  let map = {}
  flows = flows.filter(flow => flow.type === 'KineticObjectStream')
  for (let flow of flows) map[flow.label] = flow
  flows = Object.keys(map).map(key => map[key])
  let head = flows.shift()
  let tail = flows.reduce(((a, b) => a.pipe(b)), head)
  head && tail && tail.pipe(head)
  return [ head, tail ]
}


