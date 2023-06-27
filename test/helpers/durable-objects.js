/**
 * @typedef {import('@cloudflare/workers-types').DurableObjectState} DurableObjectState
 * @typedef {import('@cloudflare/workers-types').DurableObjectId} DurableObjectId
 * @typedef {import('@cloudflare/workers-types').DurableObjectStorage} DurableObjectStorage
 * @typedef {import('@cloudflare/workers-types').DurableObjectTransaction} DurableObjectTransaction
 * @typedef {import('@cloudflare/workers-types').DurableObjectNamespace} DurableObjectNamespace
 * @typedef {import('@cloudflare/workers-types').DurableObjectStub} DurableObjectStub
 */

/** @implements {DurableObjectId} */
export class MockId {
  #id
  #name

  /**
   * @param {string} id
   * @param {string} [name]
   */
  constructor (id, name) {
    this.#id = id
    this.#name = name
  }

  toString () {
    return this.#id
  }

  /** @param {DurableObjectId} other */
  equals (other) {
    return String(other) === this.#id
  }

  get name () {
    return this.#name
  }
}

class MockBasicStorage {
  /** @param {Map<string, any>} data */
  constructor (data = new Map()) {
    this.data = data
    /** @type {number|null} */
    this.alarm = null
  }

  /**
   * @param {string|string[]} key
   * @param {import('@cloudflare/workers-types').DurableObjectGetOptions} [options]
   */
  async get (key, options) {
    return Array.isArray(key)
      ? new Map(key.map(k => [k, this.data.get(k)]))
      : this.data.get(key)
  }

  /**
   * @template T
   * @param {import('@cloudflare/workers-types').DurableObjectGetOptions} [options]
   * @returns {Promise<Map<string, T>>}
   */
  async list (options) {
    return this.data
  }

  /**
   * @template T
   * @param {string|Record<string, T>} key
   * @param {T|import('@cloudflare/workers-types').DurableObjectPutOptions} [value]
   * @param {import('@cloudflare/workers-types').DurableObjectPutOptions} [options]
   */
  async put (key, value, options) {
    if (typeof key === 'string') {
      this.data.set(key, value)
      return
    }
    Object.entries(key).forEach(([k, v]) => this.data.set(k, v))
  }

  /**
   * @param {any} key
   * @param {import('@cloudflare/workers-types').DurableObjectPutOptions} [options]
   */
  async delete (key, options) {
    return Array.isArray(key)
      ? key.reduce((n, k) => n + Number(this.data.delete(k)), 0)
      : this.data.delete(key)
  }

  /**
   * @param {import('@cloudflare/workers-types').DurableObjectPutOptions} [options]
   */
  async deleteAll (options) {
    this.data.clear()
  }

  /**
   * @param {import('@cloudflare/workers-types').DurableObjectGetAlarmOptions} [options]
   */
  async getAlarm (options) {
    return this.alarm
  }

  /**
   * @param {number | Date} scheduledTime
   * @param {import('@cloudflare/workers-types').DurableObjectSetAlarmOptions} [options]
   */
  async setAlarm (scheduledTime, options) {
    this.alarm = typeof scheduledTime === 'number' ? scheduledTime : scheduledTime.getTime()
  }

  /**
   * @param {import('@cloudflare/workers-types').DurableObjectSetAlarmOptions} [options]
   */
  async deleteAlarm (options) {
    this.alarm = null
  }
}

/** @implements {DurableObjectStorage} */
export class MockStorage extends MockBasicStorage {
  #inTxn = false

  /**
   * @template T
   * @param {(txn: DurableObjectTransaction) => Promise<T>} closure
   */
  async transaction (closure) {
    if (this.#inTxn) throw new Error('another transaction in progress')
    this.#inTxn = true
    const txn = new MockTransaction(new Map(...this.data))
    const ret = await closure(txn)
    this.data = txn.data
    this.#inTxn = false
    return ret
  }

  async sync () {}
}

/** @implements {DurableObjectTransaction} */
export class MockTransaction extends MockBasicStorage {
  /** @type {Map<string, any>} */
  #prev

  /** @param {Map<string, any>} data */
  constructor (data) {
    super(new Map(...data))
    this.#prev = data
  }

  rollback () {
    this.data = this.#prev
    // TODO: other functions should throw after rollback
  }
}

/** @implements {DurableObjectState} */
export class MockState {
  #id
  #storage

  /**
   * @param {DurableObjectId} id
   * @param {DurableObjectStorage} storage
   */
  constructor (id, storage) {
    this.#id = id
    this.#storage = storage
  }

  get id () {
    return this.#id
  }

  get storage () {
    return this.#storage
  }

  waitUntil () {}

  /**
   * @template T
   * @param {() => Promise<T>} callback
   * @returns {Promise<T>}
   */
  async blockConcurrencyWhile (callback) {
    return await callback()
  }
}

/** @implements {DurableObjectNamespace} */
export class MockNamespace {
  /** @type {Map<string, import('@cloudflare/workers-types').DurableObject>} */
  #objects = new Map()

  /** @param {import('@cloudflare/workers-types').DurableObjectNamespaceNewUniqueIdOptions} options */
  newUniqueId (options) {
    return new MockId(`mock[${Math.random()}]`)
  }

  /** @param {string} name */
  idFromName (name) {
    return new MockId(`mock[${name}]`, name)
  }

  /** @param {string} id */
  idFromString (id) {
    return new MockId(`mock[${id}]`)
  }

  /**
   * @param {DurableObjectId} id
   * @param {import('@cloudflare/workers-types').DurableObjectNamespaceGetDurableObjectOptions} [options]
   */
  get (id, options) {
    const obj = this.#objects.get(id.toString())
    if (!obj) throw new Error('missing durable object')
    return new MockStub(id, obj, { name: id.name })
  }

  /**
   * @param {DurableObjectId} id
   * @param {import('@cloudflare/workers-types').DurableObject} obj
   */
  set (id, obj) {
    this.#objects.set(id.toString(), obj)
  }

  jurisdiction () {
    return this
  }
}

/** @implements {DurableObjectStub} */
class MockStub {
  /** @type {import('@cloudflare/workers-types').DurableObject} */
  #obj

  /**
   * @param {DurableObjectId} id
   * @param {import('@cloudflare/workers-types').DurableObject} obj
   * @param {{ name?: string }} [options]
   */
  constructor (id, obj, options) {
    this.id = id
    this.name = options?.name
    this.#obj = obj
  }

  /**
   * @param {import('@cloudflare/workers-types').RequestInfo} input
   * @param {import('@cloudflare/workers-types').RequestInit<import('@cloudflare/workers-types').RequestInitCfProperties>} [init]
   */
  async fetch (input, init) {
    // @ts-expect-error
    return this.#obj.fetch(new Request(input, init))
  }
}

/** @implements {InferInvokedCapability<typeof advance>} */
export class MockInvoke {
  #result

  constructor (result) {
    this.#result = result
  }

  /**
   * Mocks the `invoke` function. Accepts an object and
   * a "note by" object, returns a promise with the specified result.
   *
   * @param {object} obj
   * @param {object} nb
   * @returns {Promise<any>}
   */
  async invoke (obj, nb) {
    if (obj.method === 'trivial' && obj.args.length === 0) {
      return Promise.resolve('Trivially passed')
    }

    return Promise.resolve(this.#result)
  }
}
