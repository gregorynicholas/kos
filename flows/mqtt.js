// MQTT transaction flow
//
// NOTE: this flow REQUIREs the 'mqtt' module and will become
// active once it receives it from the upstream (or fed by the user)
//
// Streams should actively AVOID requiring dependency modules at the
// module-level (unless part of Node.js runtime). It should be
// declared at the stream-level so that the CONSUMER of the stream can
// decide how to fulfill the necessary dependency.

const kos = require('..')

module.exports = kos.create('kos-mqtt')
  .summary("Provides MQTT transaction transforms utilizing 'mqtt' module")
  .require('module/mqtt', 'module/url')
  .default('protocols', ['mqtt', 'mqtts', 'tcp', 'tls', 'ws', 'wss'])

  .in('mqtt/connect').out('mqtt/client').bind(connect)

  .in('mqtt/connect/url').out('mqtt/connect')
  .bind(function simpleConnect(url) {
    this.send('mqtt/connect', { url: url })
  })

  .in('mqtt/client','mqtt/subscribe').default('topics', new Set)
  .out('mqtt/subscription','mqtt/message')
  .bind(subscribe)

  .in('mqtt/client','mqtt/message').bind(publish)

  .in('mqtt/message/*').out('mqtt/message')
  .bind(function convert({ key, value }) {
    let topic = key.replace(/mqtt\/message\/(.+)$/,'$1')
    this.send('mqtt/message', {
      topic: topic,
      payload: value
    })
  })

function connect(opts) {
  let [ mqtt, {parse}, protocols ] = this.fetch('module/mqtt', 'module/url', 'protocols')
  let { url, options } = opts
  try { url = parse(url) }
  catch (e) { return this.throw(e) }
  
  if (protocols.includes(url.protocol)) {
    let client = mqtt.connect(url)
    mq.on('connect', () => this.send('mqtt/client', client))
    mq.on('error', e => this.throw(e))
  }
}

function subscribe() {
  let [ client, topic ] = this.inputs
  let topics = this.get('topics')
  if (!client.listeners('message').length) {
    // brand new client
    client.on('message', (topic, message, packet) => {
	  if (topics.has(topic)) 
        this.send('mqtt/message', { 
          origin: client,
          topic: topic, 
          payload: message, 
          packet: packet 
        })
    })
    client.on('error', err => this.throw(err))
    client.subscribe(Array.from(topics), null, (err, granted) => {
      if (err) this.throw(err)
      else granted.forEach(x => this.send('mqtt/subscription', x))
    })
  }
  if (!topics.has(topic)) {
    // brand new topic
    topics.add(topic)
    client.subscribe(topic, null, (err, granted) => {
      if (err) this.throw(err)
      else granted.forEach(x => this.send('mqtt/subscription', x))
    })
  }
}

function publish() {
  let [ client, message ] = this.inputs
  if (message.origin != client) {
    client.publish(message.topic, message.payload, null, (err) => {
      if (err) this.throw(err)
    })
  }
}