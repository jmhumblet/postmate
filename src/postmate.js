
/**
 * The type of messages our frames our sending
 * @type {String}
 */
export const messageType = 'application/x-postmate-v1+json'

/**
 * A unique message ID that is used to ensure responses are sent to the correct requests
 * @type {Number}
 */
let _messageId = 0

/**
 * Increments and returns a message ID
 * @return {Number} A unique ID for a message
 */
export const generateNewMessageId = () => ++_messageId

/**
 * A unique child ID that is used to ensure responses are received from the correct child iframes
 * @type {Number}
 */
let _childId = 0

/**
 * Increments and returns a message ID
 * @return {Number} A unique ID for a message
 */
function childId () {
  return ++_childId
}

/**
 * Takes a URL and returns the origin
 * @param  {String} url The full URL being requested
 * @return {String}     The URLs origin
 */
export const resolveOrigin = (url) => {
  const a = document.createElement('a')
  a.href = url
  const protocol = a.protocol.length > 4 ? a.protocol : window.location.protocol
  const host = a.host.length ? ((a.port === '80' || a.port === '443') ? a.hostname : a.host) : window.location.host
  return a.origin || `${protocol}//${host}`
}

const messageTypes = {
  handshake: 1,
  'handshake-reply': 1,
  call: 1,
  emit: 1,
  reply: 1,
  request: 1,
}

/**
 * Ensures that a message is safe to interpret
 * @param  {Object} message The postmate message being sent
 * @param  {String|Boolean} allowedOrigin The whitelisted origin or false to skip origin check
 * @return {Boolean}
 */
export const sanitize = (message, allowedOrigin) => {
  if (
    typeof allowedOrigin === 'string' &&
    message.origin !== allowedOrigin
  ) return false
  if (!message.data) return false
  if (
    typeof message.data === 'object' &&
    !('postmate' in message.data)
  ) return false
  if (message.data.type !== messageType) return false
  if (!messageTypes[message.data.postmate]) return false
  return true
}

/**
 * Ensure that the logger have basic methods
 * @param {Logger} logger
 * @returns {Logger}
 */
const SanitizeLogger = (logger) => {
  const loggerMethods = ['debug', 'error']
  loggerMethods.forEach(methodName => {
    if (logger[methodName] === undefined || typeof (logger[methodName]) !== 'function') {
      logger[methodName] = function emptyMethod () {}
    }
  })
  return logger
}

/**
 * Takes a model, and searches for a value by the property
 * @param  {Object} model     The dictionary to search against
 * @param  {String} property  A path within a dictionary (i.e. 'window.location.href')
 * @param  {Object} data      Additional information from the get request that is
 *                            passed to functions in the child model
 * @return {Promise}
 */
export const resolveValue = (model, property) => {
  const unwrappedContext = typeof model[property] === 'function'
    ? model[property]() : model[property]
  return Postmate.Promise.resolve(unwrappedContext)
}

/**
 * Composes an API to be used by the parent
 * @param {Object} info Information on the consumer
 */
export class ParentAPI {
  constructor (info) {
    this.parent = info.parent
    this.frame = info.frame
    this.child = info.child
    this.childOrigin = info.childOrigin
    this.childId = info.childId
    this.logger = info.logger

    this.events = {}

    this.logger.debug('Parent: Registering API')
    this.logger.debug('Parent: Awaiting messages...')

    this.listener = (e) => {
      if (!sanitize(e, this.childOrigin)) return false

      /**
       * the assignments below ensures that e, data, and value are all defined
       */
      const { data, name } = (((e || {}).data || {}).value || {})

      if (e.data.postmate === 'emit' && e.data.childId === this.childId) {
        this.logger.debug(`Parent: Received event emission: ${name}`)
        if (name in this.events) {
          this.events[name].forEach(callback => {
            callback.call(this, data)
          })
        }
      }
    }

    this.parent.addEventListener('message', this.listener, false)
    this.logger.debug('Parent: Awaiting event emissions from Child')
  }

  get (property) {
    return new Postmate.Promise((resolve) => {
      // Extract data from response and kill listeners
      const uid = generateNewMessageId()
      const transact = (e) => {
        if (e.data.uid === uid && e.data.postmate === 'reply' && e.data.childId === this.childId) {
          this.parent.removeEventListener('message', transact, false)
          resolve(e.data.value)
        }
      }

      // Prepare for response from Child...
      this.parent.addEventListener('message', transact, false)

      // Then ask child for information
      this.child.postMessage({
        postmate: 'request',
        type: messageType,
        property,
        uid,
      }, this.childOrigin)
    })
  }

  call (property, data) {
    // Send information to the child
    this.child.postMessage({
      postmate: 'call',
      type: messageType,
      property,
      data,
    }, this.childOrigin)
  }

  on (eventName, callback) {
    if (!this.events[eventName]) {
      this.events[eventName] = []
    }
    this.events[eventName].push(callback)
  }

  destroy () {
    this.logger.debug('Parent: Destroying Postmate instance')
    window.removeEventListener('message', this.listener, false)
    this.frame.parentNode.removeChild(this.frame)
  }
}

/**
 * Composes an API to be used by the child
 * @param {Object} info Information on the consumer
 */
export class ChildAPI {
  constructor (info) {
    this.model = info.model
    this.parent = info.parent
    this.parentOrigin = info.parentOrigin
    this.child = info.child
    this.childId = info.childId
    this.logger = info.logger

    this.logger.debug('Child: Registering API')
    this.logger.debug('Child: Awaiting messages...')

    this.child.addEventListener('message', (e) => {
      if (!sanitize(e, this.parentOrigin)) return

      this.logger.debug('Child: Received request', e.data)

      const { property, uid, data } = e.data

      if (e.data.postmate === 'call') {
        if (property in this.model && typeof this.model[property] === 'function') {
          this.model[property](data)
        }
        return
      }

      // Reply to Parent
      resolveValue(this.model, property)
        .then(value => e.source.postMessage({
          property,
          postmate: 'reply',
          type: messageType,
          childId: this.childId,
          uid,
          value,
        }, e.origin))
    })
  }

  emit (name, data) {
    this.logger.debug(`Child: Emitting Event "${name}"`, data)
    this.parent.postMessage({
      postmate: 'emit',
      type: messageType,
      childId: this.childId,
      value: {
        name,
        data,
      },
    }, this.parentOrigin)
  }
}

/**
  * The entry point of the Parent.
 * @type {Class}
 */
class Postmate {
  /**
   * The maximum number of attempts to send a handshake request to the parent
   * @type {Number}
   */
  static maxHandshakeRequests = 5

  // Internet Explorer craps itself
  static Promise = (() => {
    try {
      return window ? window.Promise : Promise
    } catch (e) {
      return null
    }
  })()

  /**
   * Sets options related to the Parent
   * @param {Object} object The element to inject the frame into, and the url
   * @return {Promise}
   */
  constructor ({
    container = typeof container !== 'undefined' ? container : document.body, // eslint-disable-line no-use-before-define
    model,
    url,
    name,
    classListArray = [],
    logger = {},
  }) { // eslint-disable-line no-undef
    this.parent = window
    this.frame = document.createElement('iframe')
    this.frame.name = name || ''
    if (classListArray.length > 0) { // check for IE 11. See issue#207
      this.frame.classList.add.apply(this.frame.classList, classListArray)
    }
    container.appendChild(this.frame)
    this.child = this.frame.contentWindow || this.frame.contentDocument.parentWindow
    this.model = model || {}
    this.childId = childId()

    this.logger = SanitizeLogger(logger)

    return this.sendHandshake(url)
  }

  /**
   * Begins the handshake strategy
   * @param  {String} url The URL to send a handshake request to
   * @return {Promise}     Promise that resolves when the handshake is complete
   */
  sendHandshake (url) {
    const childOrigin = resolveOrigin(url)
    let attempt = 0
    let responseInterval
    return new Postmate.Promise((resolve, reject) => {
      const reply = (e) => {
        if (!sanitize(e, childOrigin)) return false
        if (e.data.childId !== this.childId) return false
        if (e.data.postmate === 'handshake-reply') {
          clearInterval(responseInterval)
          this.logger.debug('Parent: Received handshake reply from Child')
          this.parent.removeEventListener('message', reply, false)
          this.childOrigin = e.origin
          this.logger.debug('Parent: Saving Child origin', this.childOrigin)
          return resolve(new ParentAPI(this))
        }

        this.logger.error('Parent: Failed handshake')
        return reject('Failed handshake')
      }

      this.parent.addEventListener('message', reply, false)

      const doSend = () => {
        if (++attempt > Postmate.maxHandshakeRequests) {
          clearInterval(responseInterval)
          this.logger.error('Parent: Handshake Timeout Reached')
          return reject('Handshake Timeout Reached')
        }

        this.logger.debug(`Parent: Sending handshake attempt ${attempt}`, { childOrigin })
        this.child.postMessage({
          postmate: 'handshake',
          type: messageType,
          model: this.model,
          childId: this.childId,
        }, childOrigin)
      }

      const loaded = () => {
        doSend()
        responseInterval = setInterval(doSend, 500)
      }

      if (this.frame.attachEvent) {
        this.frame.attachEvent('onload', loaded)
      } else {
        this.frame.addEventListener('load', loaded)
      }

      this.logger.debug('Parent: Loading frame', { url })
      this.frame.src = url
    })
  }
}

/**
 * The entry point of the Child
 * @type {Class}
 */
Postmate.Model = class Model {
  /**
   * Initializes the child, model, parent, and responds to the Parents handshake
   * @param {Object} model Hash of values, functions, or promises
   * @return {Promise}       The Promise that resolves when the handshake has been received
   */
  constructor (model, logger = {}) {
    this.child = window
    this.model = model
    this.parent = this.child.parent
    this.logger = SanitizeLogger(logger)
    return this.sendHandshakeReply()
  }

  /**
   * Responds to a handshake initiated by the Parent
   * @return {Promise} Resolves an object that exposes an API for the Child
   */
  sendHandshakeReply () {
    return new Postmate.Promise((resolve, reject) => {
      const shake = (e) => {
        if (!e.data.postmate) {
          return
        }
        if (e.data.postmate === 'handshake') {
          this.logger.debug('Child: Received handshake from Parent')
          this.child.removeEventListener('message', shake, false)
          this.logger.debug('Child: Sending handshake reply to Parent')
          e.source.postMessage({
            postmate: 'handshake-reply',
            type: messageType,
            childId: e.data.childId,
          }, e.origin)
          this.childId = e.data.childId
          this.parentOrigin = e.origin
          // Extend model with the one provided by the parent
          const defaults = e.data.model
          if (defaults) {
            Object.keys(defaults).forEach(key => {
              this.model[key] = defaults[key]
            })
            this.logger.debug('Child: Inherited and extended model from Parent')
          }

          this.logger.debug('Child: Saving Parent origin', this.parentOrigin)
          return resolve(new ChildAPI(this))
        }
        this.logger.error('Child : Handshake Reply Failed')
        return reject('Handshake Reply Failed')
      }
      this.child.addEventListener('message', shake, false)
    })
  }
}

export { Postmate }
