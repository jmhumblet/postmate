/* eslint-disable no-console */
import {
  ChildAPI,
  maxHandshakeRequests,
  generateNewMessageId,
  messageType,
  ParentAPI,
  Postmate,
  resolveOrigin,
  resolveValue,
  sanitize,
} from '../../src/postmate'

test('Message Type', () => expect(messageType).toBe('application/x-postmate-v1+json'))

test('messageId', () => expect(!isNaN(generateNewMessageId())).toBe(true))

test('generateNewMessageId adds 1', () => {
  const result = generateNewMessageId()
  expect(result).toBe(2)
})

test('Sanitize', () => {
  expect(typeof sanitize !== 'undefined')
})

// test API
// the tests below test the API generally
test('Postmate class is ready to rock', () => {
  expect(typeof Postmate !== 'undefined')
  expect(typeof Postmate).toBe('function')
  expect(typeof Postmate.Model !== 'undefined')
  expect(typeof Postmate.Model).toBe('function')
  expect(typeof Postmate.Promise !== 'undefined')
  expect(typeof Postmate.Promise).toBe('function')
})

test('ChildAPI class is ready to rock', () => {
  expect(typeof ChildAPI !== 'undefined')
  expect(typeof ChildAPI).toBe('function')
  expect(typeof ChildAPI.emit !== 'undefined')
})

test('maxHandshakeRequests class is ready to rock', () => {
  expect(maxHandshakeRequests === 5)
})

test('messageId class is ready to rock', () => {
  expect(typeof messageId !== 'undefined')
})

test('message_type class is ready to rock', () => {
  expect(typeof message_type !== 'undefined')
})

test('ParentAPI class is ready to rock', () => {
  expect(typeof ParentAPI !== 'undefined')
  expect(typeof ParentAPI).toBe('function')
})

test('resolveOrigin class is ready to rock', () => {
  expect(typeof resolveOrigin !== 'undefined')
  const result = 'https://sometest.com'
  const a = resolveOrigin(result)
  expect(a).toEqual(result)
})

test('resolveValue class is ready to rock', () => {
  expect(typeof resolveValue !== 'undefined')
})

test('sanitize class is ready to rock', () => {
  expect(typeof sanitize !== 'undefined')
})

// test mocks
// the tests below test the interworkings of Postmate methods
test('Postmate mocking', () => {
  const test = new Postmate({
    container: document.body,
    url: 'http://child.com/',
    model: { foo: 'bar' },
  })
  expect(typeof test).toBe('object')
})

test('ChildAPI mocking', () => {
  const info = {
    model: { foo: 'bar' },
    parent: document.body,
    parentOrigin: 'https://parent.com',
    child: document.body,
    source: window,
    logger: console,
  }
  const childMock = new ChildAPI(info)
  expect(typeof childMock).toBe('object')
})

test('ParentAPI mocking', () => {
  const info = {
    model: { foo: 'bar' },
    parent: document.body,
    parentOrigin: 'https://parent.com',
    child: document.body,
    source: window,
    logger: console,
  }
  const parentMock = new ParentAPI(info)
  expect(typeof parentMock).toBe('object')
})
