// Network transaction flow
//
// NOTE: this flow REQUIREs the 'net' and 'url' modules and will
// become active if already present locally, receives it from the
// upstream, or fed by the user directly.

'use strict'

const { kos = require('..') } = global

module.exports = kos
  .reactor('net', "Provides network client/server communication flows")
  .setState('protocols', ['tcp:', 'udp:'])

  .in('module/net','module/url').bind(ready)

  .in('net/connect').out('net/socket','link','net/connect')
  .use('module/net').bind(connect)

  .in('net/listen').out('net/server','net/socket','link')
  .use('module/net').bind(listen)

  .in('net/connect/url').out('net/connect')
  .use('module/url').bind(connectByUrl)

  .in('net/listen/url').out('net/listen')
  .use('module/url').bind(listenByUrl)

function ready(net, url) {
  // should add verification logic...
}

function connect(opts) {
  const [ net, protocols ] = this.fetch('module/net', 'protocols')

  let { protocol, hostname, port, retry, max } = normalizeOptions.call(this, opts)
  if (!protocols.includes(protocol)) 
    return this.error('unsupported protocol', protocol)

  let addr = `${protocol}//${hostname}:${port}`
  let sock = new net.Socket

  this.send('link', { addr: addr, socket: sock })

  sock.setNoDelay()
  sock.on('connect', () => {
    this.info("connected to", addr)
    this.send('net/socket', sock)
    sock.emit('active')
    if (retry) retry = 100
  })
  sock.on('close', () => {
    if (sock.closing) return
    retry && setTimeout(() => {
      this.debug("attempt reconnect", addr)
      // NOTE: we use send with id=null since KOs that can trigger
      // itself are automatically filtered to prevent infinite loops
      this.send('net/connect', Object.assign({}, opts, {
        retry: Math.round(Math.min(max, retry * 1.5))
      }), null)
    }, retry)
  })
  sock.on('error', this.error.bind(this))

  this.debug("attempt", addr)
  sock.connect(port, hostname)
}

function listen(opts) {
  const net = this.fetch('module/net')
  let { protocol, hostname, port, retry, max } = normalizeOptions(opts)

  let server = net.createServer(sock => {
    let addr = `${protocol}//${sock.remoteAddress}:${sock.remotePort}`
    this.info('accept', addr)
    this.send('net/socket', sock)
    this.send('link', { addr: addr, socket: sock })
    sock.emit('active')
  })
  server.on('listening', () => {
    this.info('listening', hostname, port)
    this.send('net/server', server)
  })
  server.on('error', this.error.bind(this))
  this.debug('attempt', hostname, port)
  server.listen(port, hostname)
}

function connectByUrl(dest) {
  let url = this.fetch('module/url')
  let opts = url.parse(dest, true)
  if (!opts.protocol) opts = url.parse('tcp:'+dest, true)
  this.send('net/connect', Object.assign(opts, opts.query))
}

function listenByUrl(dest) {
  let url = this.fetch('module/url')
  let opts = url.parse(dest, true)
  if (!opts.protocol) opts = url.parse('tcp:'+dest, true)
  this.send('net/listen', Object.assign(opts, opts.query))
}

function normalizeOptions(opts) {
  return {
    protocol: opts.protocol || 'tcp:',
    hostname: opts.hostname || '0.0.0.0',
    port:     parseInt(opts.port, 10) || 12345,
    retry:    parseInt(opts.retry, 10) || 100,
    max:      parseInt(opts.max, 10) || 5000
  }
}
